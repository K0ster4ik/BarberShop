// Отправка сообщения в Telegram-канал через Bot API (DESIGN.md, раздел 9).

export type TelegramConfig = { botToken: string; chatId: string };

const TIMEOUT_MS = 10_000;

/**
 * Бросает ошибку, если Telegram не принял сообщение. Токен бота стоит в URL запроса,
 * поэтому в текст ошибки он не попадает: ошибки пишутся в БД (lastError) и в лог.
 */
export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    throw new Error(`Telegram недоступен (${name})`);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      description?: string;
    } | null;
    throw new Error(
      `Telegram ответил ${response.status}: ${body?.description ?? "без описания"}`,
    );
  }
}
