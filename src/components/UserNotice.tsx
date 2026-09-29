import {
  inferNoticeVariant,
  parseUserNotice,
  type UserNoticeVariant,
} from "../lib/userNotice";

export function UserNotice({
  message,
  variant,
  className,
}: {
  message?: string;
  variant?: UserNoticeVariant;
  className?: string;
}) {
  if (!message?.trim()) return null;
  const v = inferNoticeVariant(message, variant);
  const { category, body } = parseUserNotice(message);
  const rootClass = ["user-notice", `user-notice--${v}`, className].filter(Boolean).join(" ");
  return (
    <div className={rootClass} role="status">
      {category ? (
        <>
          <span className="user-notice__category">{category}</span>
          <span className="user-notice__body">{body}</span>
        </>
      ) : (
        <span className="user-notice__body">{body}</span>
      )}
    </div>
  );
}
