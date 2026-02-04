import { SYSTEM_PROMPT } from "../constants";

// Definição de tipos para a Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

declare global {
  interface Window {
    webkitSpeechRecognition: new () => SpeechRecognition;
    SpeechRecognition: new () => SpeechRecognition;
  }
}

// Custom error types for better error handling
export class NetworkError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class APIError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'APIError';
  }
}

export class VoiceRecognitionError extends Error {
  constructor(message: string, public errorType?: string) {
    super(message);
    this.name = 'VoiceRecognitionError';
  }
}

export class GeminiService {

  private textApiUrl = "https://text.pollinations.ai/";
  private imageApiUrl = "https://image.pollinations.ai/prompt/";
  private maxRetries = 2;
  private retryDelay = 1000;

  constructor() {}

  /**
   * Fallback Local melhorado: Garante respostas sensatas se a API falhar.
   */
  private getLocalResponse(message: string): string {
    const lower = message.toLowerCase().trim();

    // Filtro de intenções
    if (lower.length === 0) return "Desculpe, não entendi.";

    // 1. Intenção de Compra (Direcionar para UI)
    if (['quero', 'me vê', 'manda', 'adicionar', 'pedir', 'comprar', 'fome'].some(v => lower.includes(v))) {
      return "Para pedir, é só clicar nos botões de **(+)** e **(-)** ao lado de cada item no cardápio abaixo! 👇🍔";
    }

    // 2. Dúvidas de Cardápio
    if (['cardápio', 'cardapio', 'menu', 'opções', 'tem o que', 'ver'].some(v => lower.includes(v))) {
      return "Nosso cardápio completo está logo abaixo das mensagens. Navegue pelas abas (Burgers, Bebidas) para ver tudo! 📋";
    }

    // 3. Sugestão
    if (['sugestão', 'indica', 'bom', 'fome', 'melhor'].some(v => lower.includes(v))) {
      return "O **X-Bacon Cheddar** é o favorito da casa! 🥓 Que tal experimentar? Adicione ele ali no menu.";
    }

    // 4. Finalização
    if (['fechar', 'conta', 'pagar', 'fim', 'acabei', 'encerrar'].some(v => lower.includes(v))) {
      return "Perfeito! Se já escolheu tudo, clique no botão **Finalizar** (o botão verde com o carrinho) para prosseguirmos.";
    }

    // 5. Informações Gerais (Horário, Local)
    if (['hora', 'funcionamento', 'aberto', 'fecha'].some(v => lower.includes(v))) {
      return "Estamos abertos todos os dias das **18h às 23h**! ⏰";
    }

    if (['onde', 'fica', 'local', 'endereço', 'bairro'].some(v => lower.includes(v))) {
      return "Somos uma Dark Kitchen! Entregamos em toda a região. 🛵";
    }

    if (['pix', 'cartão', 'dinheiro', 'pagamento'].some(v => lower.includes(v))) {
      return "Aceitamos Pix, Cartão de Crédito/Débito e Dinheiro. Você escolhe na finalização! 💳";
    }

    // 6. Saudações Simples
    if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'ei'].some(v => lower === v || lower.startsWith(v + ' '))) {
      return "Olá! Bem-vindo à **Burger & Co.**! 🍔 Estou aqui para ajudar.";
    }

    if (['obrigado', 'valeu', 'tks'].some(v => lower.includes(v))) {
      return "Imagina! Estou à disposição. 😉";
    }

    // Resposta padrão
    return "Entendi! Dê uma olhada no nosso cardápio visual aqui embaixo. Qualquer dúvida sobre os ingredientes, é só perguntar! 😉";
  }

  /**
   * Delay helper for retry mechanism
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Sanitizes user input to prevent injection and clean up text
   */
  private sanitizeInput(text: string): string {
    if (!text || typeof text !== 'string') return '';

    return text
      .trim()
      .slice(0, 500) // Limit input length
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Validates API response
   */
  private isValidResponse(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    if (text.length < 2) return false;
    if (text.includes('<html') || text.includes('<!DOCTYPE')) return false;
    if (text.toLowerCase().includes('error') && text.length < 50) return false;
    if (text.includes('undefined') && text.length < 20) return false;
    return true;
  }

  /**
   * Envia mensagem com HISTÓRICO para manter o contexto.
   * Includes retry mechanism and comprehensive error handling.
   */
  async sendMessage(message: string, history: { role: string, text: string }[] = []): Promise<string> {
    const sanitizedMessage = this.sanitizeInput(message);

    if (!sanitizedMessage) {
      return "Desculpe, nao entendi. Pode repetir?";
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Constrói o histórico para a API (limitado aos últimos 6 turnos para não estourar limite)
        const recentHistory = history.slice(-6).map(h => `${h.role === 'user' ? 'Cliente' : 'Atendente'}: ${h.text}`).join('\n');

        const fullPrompt = `${SYSTEM_PROMPT}\n\nHistórico da Conversa:\n${recentHistory}\nCliente: ${sanitizedMessage}\nAtendente:`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const response = await fetch(this.textApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: fullPrompt,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new NetworkError(`Erro de conexao: ${response.status}`, response.status);
        }

        const text = await response.text();

        if (!this.isValidResponse(text)) {
          throw new APIError("Resposta invalida do servidor");
        }

        return text.trim();

      } catch (error) {
        lastError = error as Error;

        // Don't retry on abort (timeout) or if it's a 4xx error
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn("Request timeout, using fallback");
          break;
        }

        if (error instanceof NetworkError && error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
          console.warn("Client error, not retrying:", error.statusCode);
          break;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    // All retries failed, use fallback
    console.warn("Usando resposta local (Fallback):", lastError?.message);
    return this.getLocalResponse(sanitizedMessage);
  }

  /**
   * Generates image URL with error handling
   */
  async generateItemImage(itemName: string): Promise<string | null> {
    try {
      if (!itemName || typeof itemName !== 'string') {
        return null;
      }

      const sanitizedName = itemName.trim().slice(0, 100);
      const prompt = `close up advertising photo of ${sanitizedName}, burger restaurant, juicy, 4k, hdr, studio light`;
      const seed = Math.floor(Math.random() * 9999);
      const imageUrl = `${this.imageApiUrl}${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&seed=${seed}&model=flux`;

      // Pre-validate the URL
      try {
        new URL(imageUrl);
      } catch {
        return null;
      }

      return imageUrl;
    } catch (error) {
      console.warn("Erro ao gerar URL da imagem:", error);
      return null;
    }
  }

  /**
   * Checks if voice recognition is supported
   */
  isVoiceSupported(): boolean {
    return typeof window !== 'undefined' &&
           ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  }

  /**
   * Starts voice transcription with comprehensive error handling
   */
  async startTranscription(onPartialResults: (text: string) => void): Promise<{ stop: () => void }> {
    return new Promise((resolve, reject) => {
      if (!this.isVoiceSupported()) {
        reject(new VoiceRecognitionError(
          "Seu navegador nao suporta reconhecimento de voz. Tente usar o Chrome ou Edge.",
          "not-supported"
        ));
        return;
      }

      try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'pt-BR';

        let hasStarted = false;

        recognition.onresult = (event: any) => {
          try {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i]?.[0]?.transcript) {
                transcript += event.results[i][0].transcript;
              }
            }
            if (transcript) {
              onPartialResults(transcript.trim());
            }
          } catch (error) {
            console.warn("Erro ao processar resultado de voz:", error);
          }
        };

        recognition.onerror = (e: any) => {
          const errorMessages: Record<string, string> = {
            'no-speech': 'Nenhuma fala detectada. Tente novamente.',
            'audio-capture': 'Nao foi possivel capturar audio. Verifique seu microfone.',
            'not-allowed': 'Permissao de microfone negada. Habilite nas configuracoes do navegador.',
            'network': 'Erro de rede. Verifique sua conexao.',
            'aborted': 'Gravacao cancelada.',
            'service-not-allowed': 'Servico de voz indisponivel neste navegador.'
          };

          const message = errorMessages[e.error] || `Erro de voz: ${e.error || 'desconhecido'}`;
          console.warn("Erro de reconhecimento de voz:", e.error, message);

          try {
            recognition.stop();
          } catch {
            // Ignore stop errors
          }

          if (!hasStarted) {
            reject(new VoiceRecognitionError(message, e.error));
          }
        };

        recognition.onend = () => {
          // Recognition ended naturally
        };

        recognition.start();
        hasStarted = true;

        resolve({
          stop: () => {
            try {
              recognition.stop();
            } catch (error) {
              console.warn("Erro ao parar gravacao:", error);
            }
          }
        });

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao iniciar gravacao';
        reject(new VoiceRecognitionError(message, 'start-error'));
      }
    });
  }
}

export const gemini = new GeminiService();
