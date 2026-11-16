-- Cho phép xoá mềm tin nhắn: body rỗng + image_path null là hợp lệ khi
-- deleted_at đã được đặt. Trước đây chat_messages_check chặn UPDATE này nên
-- chat-api luôn trả DELETE_FAILED.
alter table public.chat_messages
    drop constraint if exists chat_messages_check;

alter table public.chat_messages
    add constraint chat_messages_check check (
        deleted_at is not null
        or char_length(body) > 0
        or image_path is not null
    );

comment on constraint chat_messages_check on public.chat_messages is
    'Tin đã xoá mềm được phép rỗng; tin còn sống phải có nội dung hoặc ảnh.';
