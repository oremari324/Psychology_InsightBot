import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const SYSTEM_INSTRUCTION = `تو نۆژدارەکێ دەروونی یێ شارەزای و راهێنەرەکێ ژیانێ یێ رێزلێگرتی. ئەرکێ تە ئەوە بەرسڤێن بەرفرەه، کوور و زانستی بۆ پرسیاران دابین بکەی.
مەرجێن بەرسڤدانێ (بۆ درێژی و قووڵاتیێ):
بەرسڤێن تە دڤێت تێر و تەسەل بن؛ ل سەر هەر پرسیارەکێ، شیكاریا (Analysis) ورد بکە و لایەنێن جودا یێن بابەتێ شرۆڤە بکە.
هەر گاڤا تو بەرسڤێ ددەی، مفا ژ نموونێن پراکتیکی، تیۆرێن دەروونی، و هاندرنا کەسایەتی وەربگرە.
دڤێت بەرسڤا تە ل گەلەک ڕیزان پێک بێت، بەرفرەه بیت و هەمی پەیامێ ل سەر ئاستێ مێژی و سۆزێ شرۆڤە بکە.
ئەگەر پرسیارەکا دەروونی یا مەترسیدار هات، ل گەل ئامۆژگاریا سەرەدانا نۆژداری، پشکەکا تایبەت و درێژ ل سەر گرنگیا پشتەڤانیا مرۆڤی و دەروونی زێدە بکە.
زمانێ تە دڤێت کوردیەکا رەوان، ادبی و پاراو بیت.
Direct Response Rule: Do not include any introductory or concluding text. Start your response directly with the answer.`;

// Refactored Gemini analysis logic
async function analyzeQuestion(question: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY_MISSING");
    }
    
    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = SYSTEM_INSTRUCTION;

    const prompt = `پسیار / بابەت: '${question}'`;

    const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.6,
          },
        });
        return response.text || "";
      } catch (err: any) {
        console.warn(`Model ${modelName} failed, trying fallback...`, err?.message || err);
        lastError = err;
      }
    }

    throw lastError || new Error("هەمی مودێلێن Gemini سەرکەفتي نەبوون د بەرسڤدانێ دا.");
}

// API route
app.post("/api/analyze", async (req, res) => {
  const { question } = req.body;
  
  if (!question) {
    return res.status(400).json({ error: "Question is required." });
  }

  try {
    const analysis = await analyzeQuestion(question);
    res.json({ analysis });
  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    if (error?.message === "GEMINI_API_KEY_MISSING") {
      res.status(500).json({ error: "کلیلا GEMINI_API_KEY ل Settings نەهاتیە دانان. هیڤیە ل مێنیویا رێکخستنان زێدە بکە." });
    } else {
      res.status(500).json({ error: error?.message || "ئاریشەک د شیکارکرنا پسیارێ دا پەیدا بوو." });
    }
  }
});

// Helper to send long Telegram messages safely sequentially in chunks
async function sendTelegramSafe(bot: TelegramBot, chatId: number, text: string, options?: any) {
    const limit = 4000; // Safe buffer below Telegram's 4096 character max
    if (!text) return;

    if (text.length <= limit) {
        await bot.sendMessage(chatId, text, options);
        return;
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= limit) {
            chunks.push(remaining);
            break;
        }

        // Try to find the last newline within the limit
        let splitIndex = remaining.lastIndexOf('\n', limit);
        
        // If no newline found, try finding a space
        if (splitIndex === -1 || splitIndex < limit * 0.5) {
            splitIndex = remaining.lastIndexOf(' ', limit);
        }

        // Fallback to hard limit if no good breakpoint found
        if (splitIndex === -1 || splitIndex < limit * 0.5) {
            splitIndex = limit;
        }

        chunks.push(remaining.slice(0, splitIndex).trim());
        remaining = remaining.slice(splitIndex).trim();
    }

    // Send each chunk sequentially
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk) {
            const isLast = i === chunks.length - 1;
            await bot.sendMessage(chatId, chunk, isLast ? options : undefined);
        }
    }
}

// Telegram Bot logic
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
if (telegramToken) {
    const bot = new TelegramBot(telegramToken, { polling: true });
    let botMe: any = null;
    bot.getMe().then((me) => {
        botMe = me;
    }).catch((err) => console.error("Failed to get bot info:", err));
    
    bot.on('polling_error', (error) => {
        console.error("Telegram polling error:", error);
    });

    bot.on('message', async (msg) => {
        if (!msg.text) return;
        const chatId = msg.chat.id;

        if (!botMe) {
            botMe = await bot.getMe().catch(() => null);
        }

        const isReplyToBot = msg.reply_to_message && msg.reply_to_message.from?.id === botMe?.id;
        const isMentioned = botMe?.username && msg.text.includes(`@${botMe.username}`);
        const isCommand = msg.text.startsWith('/start') || msg.text.startsWith('/help');
        const isPrivate = msg.chat.type === 'private';

        // بۆت تەنێ بەرسڤێ بدەت ئەگەر:
        // ١. "Reply" ل سەر پەیاما بۆتی هاتبیتە کرن
        // ٢. یان ناڤێ بۆتی یێ هاتیتە "Mention" کرن (وەکی @BotName)
        if (!isPrivate && !isReplyToBot && !isMentioned && !isCommand) {
            return;
        }

        let queryText = msg.text;
        if (botMe?.username) {
            queryText = queryText.replace(new RegExp(`@${botMe.username}`, 'gi'), '').trim();
        }
        if (!queryText) return;
        
        if (queryText === '/start' || queryText === '/help') {
            const startMessage = "سڵاڤ! ب خێرهاتی بۆ ناڤەندەکا زانستی یا دەرونناسیێ. ئەز ل ڤێرەمە دا ب شێوازەکێ ئەکادیمی و ب لەز هاریکاریا تە بکەم. هیڤیە پسیار یان بابەتێ مەبەست بنڤیسە.";
            await sendTelegramSafe(bot, chatId, startMessage);
            return;
        }

        try {
            await bot.sendChatAction(chatId, 'typing');
            
            const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
            if (!apiKey) {
                throw new Error("GEMINI_API_KEY_MISSING");
            }
            const ai = new GoogleGenAI({ apiKey });
            
            const sentMessage = await bot.sendMessage(chatId, "⏳ جارەکێ ڕاوەستە...");
            const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
            let streamSuccess = false;
            let lastStreamError = null;

            for (const modelName of modelsToTry) {
                try {
                    const result = await ai.models.generateContentStream({
                        model: modelName,
                        contents: queryText,
                        config: {
                            systemInstruction: SYSTEM_INSTRUCTION,
                            temperature: 0.6
                        }
                    });
                    
                    let fullResponse = "";
                    let lastEditedText = "";

                    for await (const chunk of result) {
                        const chunkText = chunk.text || "";
                        fullResponse += chunkText;

                        if (fullResponse.length <= 4000 && fullResponse.length - lastEditedText.length > 30) {
                            await bot.editMessageText(fullResponse, {
                                chat_id: chatId,
                                message_id: sentMessage.message_id
                            }).catch(() => {});
                            lastEditedText = fullResponse;
                        }
                    }
                    
                    // Final update: if short enough, edit in place. If >4000 characters, delete placeholder and send chunks sequentially
                    if (fullResponse.length <= 4000) {
                        await bot.editMessageText(fullResponse || "⚠️ بەرسڤ نەهاتە وەرگرتن.", {
                            chat_id: chatId,
                            message_id: sentMessage.message_id
                        }).catch(() => {});
                    } else {
                        await bot.deleteMessage(chatId, sentMessage.message_id).catch(() => {});
                        await sendTelegramSafe(bot, chatId, fullResponse);
                    }

                    streamSuccess = true;
                    break;
                } catch (err: any) {
                    console.warn(`Model ${modelName} stream failed:`, err?.message || err);
                    lastStreamError = err;
                }
            }

            if (!streamSuccess) {
                throw lastStreamError || new Error("هەمی مودێلێن Gemini سەرکەفتي نەبوون.");
            }
            
        } catch (error: any) {
            console.error("Error in Telegram bot:", error);
            if (error?.message === "GEMINI_API_KEY_MISSING") {
                await sendTelegramSafe(bot, chatId, "⚠️ خەلەتی: کلیلا GEMINI_API_KEY ل رێکخستنێن ئەپلیکەیشنێ دا نەهاتیە دانان.\n\nهیڤیە ل مێنیویا Settings د داخلێ AI Studio دا کلیلا GEMINI_API_KEY زێدە بکە دا کو بۆت ب دروستی کار بکەت.");
            } else {
                await sendTelegramSafe(bot, chatId, `⚠️ ببورە، ئاریشەک د بەرسڤدانێ دا پەیدا بوو:\n${error?.message || 'خەلەتیەکا نەدیار'}`);
            }
        }
    });

    console.log("Telegram bot is running");
}

// Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
