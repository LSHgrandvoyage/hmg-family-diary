import type { BetterAuthOptions } from "better-auth";
import type { Pool } from "pg";
import nodemailer from "nodemailer";
export function authOptions(
  database: Pool,
  env = process.env,
): BetterAuthOptions {
  const mail = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 1025),
    secure: false,
  });
  const send = async (email: string, url: string, subject: string) => {
    await mail.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject,
      text: `${subject}\n\n${url}\n\n요청하지 않았다면 무시해 주세요.`,
    });
  };
  return {
    appName: "가족의 이야기",
    database,
    baseURL: env.APP_ORIGIN,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_ORIGIN!],
    logger: { disabled: true },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        send(user.email, url, "가족의 이야기 비밀번호 재설정"),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) =>
        send(user.email, url, "가족의 이야기 이메일 확인"),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
    advanced: {
      useSecureCookies: true,
      database: { generateId: "uuid" },
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      },
    },
  };
}
