// WebAuthn/passkey dùng chung cho bind-student-session và passkey-api.
//
// - Challenge ngẫu nhiên 32 byte, lưu DB 5 phút, dùng một lần.
// - Khoá riêng tư không bao giờ rời thiết bị; server chỉ lưu public key.
// - RP ID/origin lấy từ Secrets, không lấy từ Host của request.
import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse
} from 'https://esm.sh/@simplewebauthn/server@13.1.2';

type Client = {
    from: (table: string) => any;
};

export interface PasskeyRow {
    id: string;
    credential_id: string;
    public_key: string;
    counter: number;
    transports: string[] | null;
}

function env(name: string, fallback: string): string {
    try {
        return (Deno.env.get(name) || '').trim() || fallback;
    } catch (_) {
        return fallback;
    }
}

export function rpID(): string {
    return env('PASSKEY_RP_ID', 'minhtruk.github.io');
}

export function expectedOrigin(): string {
    return env('PASSKEY_ORIGIN', 'https://minhtruk.github.io');
}

export function b64urlEncode(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function b64urlDecode(value: string): Uint8Array {
    const s = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    const binary = atob(s + pad);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

function newChallenge(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return b64urlEncode(bytes);
}

async function saveChallenge(
    client: Client,
    studentId: string,
    authUserId: string,
    kind: 'register' | 'login',
    challenge: string
): Promise<string> {
    const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { data, error } = await client
        .from('passkey_challenges')
        .insert({
            student_id: studentId,
            auth_user_id: authUserId,
            kind,
            challenge,
            expires_at: expires
        })
        .select('id')
        .maybeSingle();
    if (error || !data) throw new Error('CHALLENGE_FAILED');
    return String(data.id);
}

export async function loadChallenge(
    client: Client,
    id: string,
    authUserId: string,
    kind: 'register' | 'login'
): Promise<{ id: string; student_id: string; challenge: string } | null> {
    const { data } = await client
        .from('passkey_challenges')
        .select('id, student_id, challenge, kind, auth_user_id, expires_at, used_at')
        .eq('id', id)
        .eq('auth_user_id', authUserId)
        .eq('kind', kind)
        .maybeSingle();
    if (!data || data.used_at) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    return { id: String(data.id), student_id: String(data.student_id), challenge: String(data.challenge) };
}

export async function useChallenge(client: Client, id: string): Promise<void> {
    await client.from('passkey_challenges')
        .update({ used_at: new Date().toISOString() })
        .eq('id', id);
}

export async function passkeysFor(client: Client, studentId: string): Promise<PasskeyRow[]> {
    const { data } = await client
        .from('student_passkeys')
        .select('id, credential_id, public_key, counter, transports')
        .eq('student_id', studentId)
        .order('created_at', { ascending: true });
    return (data ?? []) as PasskeyRow[];
}

export async function passkeyCount(client: Client, studentId: string): Promise<number> {
    const { count } = await client
        .from('student_passkeys')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', studentId);
    return Number(count || 0);
}

export async function registrationOptions(
    client: Client,
    authUserId: string,
    student: { id: string; display_name: string; student_code?: string | null }
) {
    const existing = await passkeysFor(client, student.id);
    if (existing.length >= 5) throw new Error('TOO_MANY_PASSKEYS');
    const options = await generateRegistrationOptions({
        rpName: 'Bá Khí',
        rpID: rpID(),
        userID: new TextEncoder().encode(student.id),
        userName: student.student_code || student.id,
        userDisplayName: student.display_name,
        attestationType: 'none',
        excludeCredentials: existing.map((p) => ({
            id: p.credential_id,
            transports: (p.transports || []) as any
        })),
        authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred'
        }
    });
    const challengeId = await saveChallenge(client, student.id, authUserId, 'register', options.challenge);
    return { challenge_id: challengeId, options };
}

export async function authenticationOptions(
    client: Client,
    authUserId: string,
    student: { id: string }
) {
    const existing = await passkeysFor(client, student.id);
    if (!existing.length) throw new Error('NO_PASSKEY');
    const options = await generateAuthenticationOptions({
        rpID: rpID(),
        allowCredentials: existing.map((p) => ({
            id: p.credential_id,
            transports: (p.transports || []) as any
        })),
        userVerification: 'preferred'
    });
    const challengeId = await saveChallenge(client, student.id, authUserId, 'login', options.challenge);
    return { challenge_id: challengeId, options };
}

export async function verifyRegistration(
    client: Client,
    studentId: string,
    response: unknown,
    challenge: string
): Promise<PasskeyRow> {
    const result = await verifyRegistrationResponse({
        response: response as any,
        expectedChallenge: challenge,
        expectedOrigin: expectedOrigin(),
        expectedRPID: rpID(),
        requireUserVerification: false
    });
    if (!result.verified || !result.registrationInfo) throw new Error('BAD_PASSKEY');
    const info = result.registrationInfo;
    const credential = info.credential;
    const row = {
        student_id: studentId,
        credential_id: credential.id,
        public_key: b64urlEncode(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || [],
        device_type: info.credentialDeviceType || 'singleDevice',
        backed_up: !!info.credentialBackedUp
    };
    const { data, error } = await client
        .from('student_passkeys')
        .insert(row)
        .select('id, credential_id, public_key, counter, transports')
        .maybeSingle();
    if (error) {
        if (String(error.code || '') === '23505') throw new Error('PASSKEY_EXISTS');
        throw new Error('PASSKEY_SAVE_FAILED');
    }
    return data as PasskeyRow;
}

export async function verifyAuthentication(
    client: Client,
    studentId: string,
    response: any,
    challenge: string
): Promise<void> {
    const id = String(response?.id || '');
    if (!id) throw new Error('BAD_PASSKEY');
    const { data } = await client
        .from('student_passkeys')
        .select('id, credential_id, public_key, counter, transports')
        .eq('student_id', studentId)
        .eq('credential_id', id)
        .maybeSingle();
    if (!data) throw new Error('PASSKEY_NOT_FOUND');
    const result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: expectedOrigin(),
        expectedRPID: rpID(),
        credential: {
            id: data.credential_id,
            publicKey: b64urlDecode(data.public_key),
            counter: Number(data.counter || 0),
            transports: (data.transports || []) as any
        },
        requireUserVerification: false
    });
    if (!result.verified) throw new Error('BAD_PASSKEY');
    await client.from('student_passkeys')
        .update({
            counter: result.authenticationInfo.newCounter,
            last_used_at: new Date().toISOString()
        })
        .eq('id', data.id);
}
