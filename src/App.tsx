import React, { useState, useEffect, useRef, useCallback, useMemo, TouchEvent } from 'react';
import {
  Bot, CheckCheck, Send, ShoppingCart, Utensils, Image as ImageIcon,
  Loader2, Plus, Minus, Mic, MicOff, Circle, RefreshCw, ClipboardCheck,
  ChevronRight, ChevronLeft, Clock, Search, Sandwich, CupSoda, Package,
  X, Edit3, ArrowLeft, AlertCircle, Menu as MenuIcon, WifiOff, Volume2
} from 'lucide-react';
import { Message, CartItem, UserData, MenuItem } from './types';
import { STORE_NAME, STORE_PHONE, MENU, WHATSAPP_BG, CATEGORIES, DELIVERY_FEE, ESTIMATED_TIME } from './constants';
import { gemini, VoiceRecognitionError } from './services/geminiService';
import {
  validateCEP,
  validateName,
  validateAddress,
  validateAddressNumber,
  validatePaymentMethod,
  sanitizeDisplayText,
  isMobileDevice
} from './utils/validation';

type FlowStep = 'ordering' | 'ask_name' | 'ask_address' | 'ask_address_number' | 'confirm_address' | 'ask_payment' | 'review' | 'edit_info' | 'finished';

// Error notification type
interface Notification {
  id: string;
  type: 'error' | 'warning' | 'success' | 'info';
  message: string;
  dismissible?: boolean;
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [inputText, setInputText] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [userData, setUserData] = useState<UserData>({ name: '', address: '', paymentMethod: '' });
  const [pendingAddress, setPendingAddress] = useState('');
  const [flowStep, setFlowStep] = useState<FlowStep>('ordering');
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [generatingAssets, setGeneratingAssets] = useState<Record<string, boolean>>({});
  const [isChatClosed, setIsChatClosed] = useState(false);
  const [redirectionProgress, setRedirectionProgress] = useState(0);
  const [isSearchingCEP, setIsSearchingCEP] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editField, setEditField] = useState<'name' | 'address' | 'payment' | null>(null);

  // Enhanced state for error handling and UX
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [transcriptionSession, setTranscriptionSession] = useState<{ stop: () => void } | null>(null);

  // Touch/Swipe state
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const minSwipeDistance = 50;

  // Check voice support on mount
  useEffect(() => {
    setVoiceSupported(gemini.isVoiceSupported());
  }, []);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showNotification('success', 'Conexao restaurada!', true);
    };

    const handleOffline = () => {
      setIsOnline(false);
      showNotification('error', 'Sem conexao com a internet', false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-dismiss notifications
  useEffect(() => {
    const timer = setInterval(() => {
      setNotifications(prev =>
        prev.filter(n => !n.dismissible || Date.now() - parseInt(n.id) < 5000)
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const showNotification = useCallback((type: Notification['type'], message: string, dismissible = true) => {
    const id = Date.now().toString();
    setNotifications(prev => {
      // Avoid duplicate messages
      if (prev.some(n => n.message === message)) return prev;
      return [...prev.slice(-3), { id, type, message, dismissible }];
    });
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  const getTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const addMessage = useCallback((role: 'bot' | 'user', text: string, extra?: Partial<Message>) => {
    const sanitizedText = sanitizeDisplayText(text);
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      role,
      text: sanitizedText,
      timestamp: getTime(),
      ...extra
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage;
  }, []);

  const subtotalValue = useMemo(() => cart.reduce((acc, item) => acc + (item.price * item.quantity), 0), [cart]);
  const totalValue = useMemo(() => subtotalValue + (subtotalValue > 0 ? DELIVERY_FEE : 0), [subtotalValue]);

  const getWhatsAppURL = (data: UserData, autoSend: boolean = false) => {
    const itemsList = cart.map(i => `• ${i.quantity}x ${i.name} (R$ ${(i.price * i.quantity).toFixed(2)})`).join('\n');
    const message = `*NOVO PEDIDO - ${STORE_NAME.toUpperCase()}*\n\n` +
                    `*CLIENTE:* ${data.name}\n` +
                    `*ENTREGA:* ${data.address}\n` +
                    `*PAGAMENTO:* ${data.paymentMethod}\n\n` +
                    `*ITENS DO PEDIDO:*\n${itemsList}\n\n` +
                    `*Subtotal:* R$ ${subtotalValue.toFixed(2)}\n` +
                    `*Taxa de Entrega:* R$ ${DELIVERY_FEE.toFixed(2)}\n` +
                    `*TOTAL: R$ ${totalValue.toFixed(2)}*\n\n` +
                    `_Pedido gerado via Auto-Atendimento_`;
    // Using web.whatsapp.com with send parameter attempts to auto-send
    const baseUrl = autoSend
      ? `https://web.whatsapp.com/send?phone=${STORE_PHONE}&text=${encodeURIComponent(message)}`
      : `https://wa.me/${STORE_PHONE}?text=${encodeURIComponent(message)}`;
    return baseUrl;
  };

  /**
   * CEP lookup with comprehensive error handling
   */
  const handleCEPAction = async (cep: string): Promise<any | null> => {
    const validation = validateCEP(cep);

    if (!validation.valid) {
      showNotification('error', validation.error || 'CEP invalido');
      return null;
    }

    if (!isOnline) {
      showNotification('error', 'Sem conexao. Verifique sua internet.');
      return null;
    }

    setIsSearchingCEP(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`https://viacep.com.br/ws/${validation.cleanCEP}/json/`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.erro) {
        showNotification('error', 'CEP nao encontrado. Verifique e tente novamente.');
        return null;
      }

      // Validate required fields
      if (!data.logradouro && !data.bairro && !data.localidade) {
        showNotification('warning', 'CEP encontrado, mas sem endereco completo. Digite manualmente.');
        return null;
      }

      return data;

    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          showNotification('error', 'Tempo esgotado. Tente novamente ou digite o endereco.');
        } else {
          showNotification('error', 'Erro ao buscar CEP. Digite o endereco completo.');
        }
      }
      console.warn("Erro ao buscar CEP:", error);
      return null;

    } finally {
      setIsSearchingCEP(false);
    }
  };

  const handleBotResponse = async (userText: string) => {
    setIsTyping(true);

    try {
      const sanitizedInput = sanitizeDisplayText(userText);

      if (!sanitizedInput) {
        setIsTyping(false);
        addMessage('bot', 'Desculpe, nao entendi. Pode repetir?');
        return;
      }

      // --- Edit Info Flow ---
      if (flowStep === 'edit_info') {
        if (editField === 'name') {
          const nameValidation = validateName(sanitizedInput);
          if (!nameValidation.valid) {
            setIsTyping(false);
            showNotification('error', nameValidation.error || 'Nome invalido');
            addMessage('bot', `${nameValidation.error} Tente novamente.`);
            return;
          }
          setUserData(prev => ({ ...prev, name: nameValidation.cleanName }));
          setIsTyping(false);
          addMessage('bot', `Nome atualizado para *${nameValidation.cleanName}*!`);
          setEditField(null);
          setFlowStep('review');
          showReviewMessage({ ...userData, name: nameValidation.cleanName });
          return;
        }
        if (editField === 'address') {
          // Check if it's a CEP
          const cepMatch = sanitizedInput.match(/\d{5}-?\d{3}/) || sanitizedInput.match(/^\d{8}$/);
          if (cepMatch) {
            const cepData = await handleCEPAction(cepMatch[0]);
            if (cepData) {
              const baseAddress = `${cepData.logradouro || ''}, ${cepData.bairro || ''}, ${cepData.localidade || ''} - ${cepData.uf || ''}`.replace(/^,\s*/, '').replace(/,\s*,/g, ',');
              setPendingAddress(baseAddress);
              setIsTyping(false);
              addMessage('bot', `Encontrei o endereco:\n*${baseAddress}*\n\nAgora informe o **numero da casa** e complemento.`);
              setFlowStep('ask_address_number');
              return;
            } else {
              setIsTyping(false);
              return;
            }
          }
          const addressValidation = validateAddress(sanitizedInput);
          if (!addressValidation.valid && addressValidation.missing === 'all') {
            setIsTyping(false);
            showNotification('error', addressValidation.error || 'Endereco invalido');
            addMessage('bot', `${addressValidation.error} Tente novamente.`);
            return;
          }
          setUserData(prev => ({ ...prev, address: sanitizedInput }));
          setIsTyping(false);
          addMessage('bot', `Endereco atualizado!`);
          setEditField(null);
          setFlowStep('review');
          showReviewMessage({ ...userData, address: sanitizedInput });
          return;
        }
        if (editField === 'payment') {
          const paymentValidation = validatePaymentMethod(sanitizedInput);
          if (!paymentValidation.valid) {
            setIsTyping(false);
            showNotification('error', paymentValidation.error || 'Forma de pagamento invalida');
            return;
          }
          setUserData(prev => ({ ...prev, paymentMethod: sanitizedInput }));
          setIsTyping(false);
          addMessage('bot', `Forma de pagamento atualizada para *${sanitizedInput}*!`);
          setEditField(null);
          setFlowStep('review');
          showReviewMessage({ ...userData, paymentMethod: sanitizedInput });
          return;
        }
      }

      // --- ESTÁGIOS DE COLETA DE DADOS ---

      if (flowStep === 'ask_name') {
        const nameValidation = validateName(sanitizedInput);
        if (!nameValidation.valid) {
          setIsTyping(false);
          showNotification('warning', nameValidation.error || 'Nome invalido');
          addMessage('bot', nameValidation.error || 'Por favor, digite um nome valido.');
          return;
        }
        setUserData(prev => ({ ...prev, name: nameValidation.cleanName }));
        setIsTyping(false);
        addMessage('bot', `Prazer, *${nameValidation.cleanName}*!\nQual o **endereco de entrega**? (Digite o CEP ou Nome da Rua)`);
        setFlowStep('ask_address');
        return;
      }

      if (flowStep === 'ask_address') {
        // Tenta identificar CEP
        const cepMatch = sanitizedInput.match(/\d{5}-?\d{3}/) || sanitizedInput.match(/^\d{8}$/);

        if (cepMatch) {
          const cepData = await handleCEPAction(cepMatch[0]);
          if (cepData) {
            const baseAddress = `${cepData.logradouro || ''}, ${cepData.bairro || ''}, ${cepData.localidade || ''} - ${cepData.uf || ''}`.replace(/^,\s*/, '').replace(/,\s*,/g, ',');
            setPendingAddress(baseAddress);
            setIsTyping(false);
            addMessage('bot', `Encontrei o endereco:\n*${baseAddress}*\n\n**Este endereco esta correto?**\nResponda *SIM* para confirmar ou *NAO* para digitar outro.`);
            setFlowStep('confirm_address');
            return;
          } else {
            setIsTyping(false);
            addMessage('bot', 'Nao consegui encontrar o CEP. Tente digitar o endereco completo.');
            return;
          }
        }

        // Validação de endereço digitado manualmente
        const validation = validateAddress(sanitizedInput);

        if (!validation.valid && validation.missing === 'all') {
          setIsTyping(false);
          showNotification('warning', 'Endereco muito curto');
          addMessage('bot', "O endereco parece muito curto. Por favor, digite Rua, Bairro e Cidade.");
          return;
        }

        if (!validation.valid && validation.missing === 'number') {
          setPendingAddress(sanitizedInput);
          setIsTyping(false);
          addMessage('bot', "Entendi a rua! Agora preciso do **numero da casa**.");
          setFlowStep('ask_address_number');
          return;
        }

        setUserData(prev => ({ ...prev, address: sanitizedInput }));
        setIsTyping(false);
        addMessage('bot', `Anotado!\nComo voce prefere **pagar**?`);
        setFlowStep('ask_payment');
        return;
      }

      if (flowStep === 'confirm_address') {
        const response = sanitizedInput.toLowerCase().trim();
        const positiveResponses = ['sim', 's', 'yes', 'confirmo', 'correto', 'isso', 'certo', 'ok', 'confirmar'];
        const negativeResponses = ['nao', 'não', 'n', 'no', 'errado', 'nope', 'negativo', 'outro'];

        if (positiveResponses.includes(response)) {
          setIsTyping(false);
          addMessage('bot', `Otimo! Agora informe o **numero da casa** e complemento (ex: 123, Apto 45).`);
          setFlowStep('ask_address_number');
          return;
        } else if (negativeResponses.includes(response)) {
          setPendingAddress('');
          setIsTyping(false);
          addMessage('bot', `Sem problemas! Digite o endereco completo ou outro CEP.`);
          setFlowStep('ask_address');
          return;
        } else {
          setIsTyping(false);
          addMessage('bot', `Por favor, responda *SIM* para confirmar ou *NAO* para digitar outro endereco.`);
          return;
        }
      }

      if (flowStep === 'ask_address_number') {
        const numberValidation = validateAddressNumber(sanitizedInput);
        if (!numberValidation.valid) {
          setIsTyping(false);
          showNotification('warning', numberValidation.error || 'Numero invalido');
          addMessage('bot', numberValidation.error || 'Por favor, digite o numero da casa.');
          return;
        }

        const finalAddress = pendingAddress
          ? `${pendingAddress}, N ${sanitizedInput}`
          : `${userData.address}, N ${sanitizedInput}`;
        setUserData(prev => ({ ...prev, address: finalAddress }));
        setPendingAddress('');
        setIsTyping(false);
        addMessage('bot', `Endereco completo!\nQual a **forma de pagamento**?`);
        setFlowStep('ask_payment');
        return;
      }

      if (flowStep === 'ask_payment') {
        const paymentValidation = validatePaymentMethod(sanitizedInput);
        if (!paymentValidation.valid) {
          setIsTyping(false);
          showNotification('warning', 'Selecione uma forma de pagamento');
          addMessage('bot', 'Por favor, escolha: Pix, Cartao ou Dinheiro.');
          return;
        }
        setUserData(prev => ({ ...prev, paymentMethod: sanitizedInput }));
        setIsTyping(false);
        setFlowStep('review');
        showReviewMessage({ ...userData, paymentMethod: sanitizedInput });
        return;
      }

      // --- IA GENERATIVA (Ordering) ---
      if (!isOnline) {
        setIsTyping(false);
        addMessage('bot', 'Estou sem conexao no momento. Use os botoes do cardapio para fazer seu pedido!');
        return;
      }

      const historyContext = messages.slice(-5).map(m => ({ role: m.role, text: m.text }));
      const botResponse = await gemini.sendMessage(sanitizedInput, historyContext);

      setIsTyping(false);
      addMessage('bot', botResponse);

    } catch (e) {
      console.error("Erro no fluxo do bot:", e);
      setIsTyping(false);
      addMessage('bot', "Ops! Tive um problema tecnico. Mas voce pode continuar usando os botoes do cardapio!");
    }
  };

  const showReviewMessage = (data: UserData) => {
    const itemsText = cart.map(i => `• ${i.quantity}x ${i.name}`).join('\n');
    addMessage('bot', `*CONFIRA SEU PEDIDO* 📋\n\n${itemsText}\n\n👤 *Nome:* ${data.name}\n📍 *Local:* ${data.address}\n💳 *Pagamento:* ${data.paymentMethod}\n\n💰 *TOTAL: R$ ${totalValue.toFixed(2)}*\n\nEsta tudo certo? Clique em **Confirmar** ou **Voltar** para corrigir!`);
  };

  const handleSend = (textToSend?: string) => {
    if (isChatClosed) return;
    const text = textToSend || inputText;

    if (!text || text.trim().length === 0) {
      return;
    }

    setInputText('');
    addMessage('user', text);
    handleBotResponse(text);
  };

  const startCheckoutFlow = () => {
    if (cart.length === 0) {
      addMessage('bot', "Seu carrinho esta vazio! Adicione itens antes de finalizar.");
      return;
    }
    addMessage('user', "Fechar meu Pedido");
    setFlowStep('ask_name');
    setIsTyping(true);
    setTimeout(() => {
        setIsTyping(false);
        addMessage('bot', "Perfeito! Vamos fechar seu pedido.\n\nPrimeiro, qual e o seu **nome**?");
    }, 600);
  };

  const handleShowMenu = () => {
    setShowMenu(true);
    addMessage('user', "Ver Cardapio");
    setTimeout(() => {
      addMessage('bot', `Aqui esta nosso cardapio completo! 📋\n\nNavegue pelas categorias acima (Burgers, Acompanhamentos, Bebidas) e clique no **(+)** para adicionar ao carrinho.\n\nDeslize para o lado para trocar de categoria!`);
    }, 300);
  };

  const goBackToEditing = () => {
    setFlowStep('edit_info');
    addMessage('bot', `*SUAS INFORMACOES ATUAIS:*\n\n👤 *Nome:* ${userData.name}\n📍 *Endereco:* ${userData.address}\n💳 *Pagamento:* ${userData.paymentMethod}\n\nO que deseja alterar? Clique em uma opcao abaixo.`);
  };

  const handleExitChat = () => {
    if (window.confirm('Tem certeza que deseja sair? Seu pedido sera perdido.')) {
      window.location.reload();
    }
  };

  const startVoiceRecording = async () => {
    if (isChatClosed || isRecording) return;

    if (!voiceSupported) {
      showNotification('warning', 'Seu navegador nao suporta gravacao de voz. Tente Chrome ou Edge.');
      return;
    }

    try {
      setIsRecording(true);
      const session = await gemini.startTranscription((partialText) => setInputText(partialText));
      setTranscriptionSession(session);
    } catch (e) {
      console.error("Erro ao iniciar gravacao:", e);
      setIsRecording(false);

      if (e instanceof VoiceRecognitionError) {
        showNotification('error', e.message);
      } else {
        showNotification('error', 'Nao foi possivel acessar o microfone. Verifique as permissoes.');
      }
    }
  };

  const stopVoiceRecording = async () => {
    if (transcriptionSession) {
      try {
        await transcriptionSession.stop();
      } catch (e) {
        console.warn("Erro ao parar gravacao:", e);
      }
      setTranscriptionSession(null);
    }
    setIsRecording(false);

    // Small delay to ensure final transcription is captured
    setTimeout(() => {
      if (inputText.trim().length > 0) handleSend();
    }, 300);
  };

  const handleShowImage = async (itemName: string) => {
    const loaderId = `img-${itemName}`;
    if (generatingAssets[loaderId]) return;

    if (!isOnline) {
      showNotification('warning', 'Sem conexao para carregar imagem');
      return;
    }

    setGeneratingAssets(prev => ({ ...prev, [loaderId]: true }));
    try {
      const imageUrl = await gemini.generateItemImage(itemName);
      if (imageUrl) {
        addMessage('bot', `Aqui esta uma foto do *${itemName}*!`, { image: imageUrl });
      } else {
        addMessage('bot', `Nao consegui gerar a foto do *${itemName}* agora. Mas garanto que e delicioso!`);
      }
    } catch (e) {
      console.warn("Erro imagem:", e);
      addMessage('bot', `Nao consegui carregar a foto. Tente novamente mais tarde.`);
    } finally {
      setGeneratingAssets(prev => ({ ...prev, [loaderId]: false }));
    }
  };

  const addToCart = useCallback((item: MenuItem) => {
    if (isChatClosed) return;
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        // Limit quantity to prevent abuse
        if (existing.quantity >= 99) {
          return prev;
        }
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, [isChatClosed]);

  const removeFromCart = useCallback((id: number) => {
    if (isChatClosed) return;
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: i.quantity - 1 } : i).filter(i => i.quantity > 0));
  }, [isChatClosed]);

  const startRedirection = () => {
    // Validate all required data before starting
    if (!userData.name || !userData.address || !userData.paymentMethod) {
      showNotification('error', 'Dados incompletos. Por favor, preencha todas as informacoes.');
      setFlowStep('edit_info');
      return;
    }

    if (cart.length === 0) {
      showNotification('error', 'Carrinho vazio. Adicione itens antes de finalizar.');
      setFlowStep('ordering');
      return;
    }

    setFlowStep('finished');
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setRedirectionProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        try {
          // Try to auto-send via web.whatsapp.com first
          const autoSendUrl = getWhatsAppURL(userData, true);
          const fallbackUrl = getWhatsAppURL(userData, false);

          // Determine which URL to use based on device
          const isMobile = isMobileDevice();
          const targetUrl = isMobile ? fallbackUrl : autoSendUrl;

          // Open in new tab
          const newWindow = window.open(targetUrl, '_blank');

          // Fallback if popup blocked
          if (!newWindow || newWindow.closed) {
            window.location.href = fallbackUrl;
          }
        } catch (e) {
          console.warn("Erro ao redirecionar:", e);
          // Ultimate fallback
          window.location.href = getWhatsAppURL(userData, false);
        }
        setIsChatClosed(true);
      }
    }, 60);
  };

  // Swipe handlers for category navigation
  const onTouchStart = (e: TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe || isRightSwipe) {
      const currentIndex = CATEGORIES.indexOf(activeCategory);
      if (isLeftSwipe && currentIndex < CATEGORIES.length - 1) {
        setActiveCategory(CATEGORIES[currentIndex + 1]);
      } else if (isRightSwipe && currentIndex > 0) {
        setActiveCategory(CATEGORIES[currentIndex - 1]);
      }
    }
  };

  useEffect(() => {
    const startApp = async () => {
        setTimeout(() => {
            addMessage('bot', "Ola! Bem-vindo a **Burger & Co.**\nEu sou seu assistente virtual.\n\nToque em **Ver Cardapio** para comecar ou me pergunte algo!");
        }, 500);
    };
    startApp();
  }, []);

  const renderFormattedText = (text: string) => {
    return text.split('\n').map((line, i) => (
      <span key={i} className="block min-h-[1.2em]">
        {line.split(/(\*\*.*?\*\*|\*.*?\*|_.*?_)/).map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) return <strong key={j}>{part.slice(2, -2)}</strong>;
          if (part.startsWith('*') && part.endsWith('*')) return <strong key={j}>{part.slice(1, -1)}</strong>;
          if (part.startsWith('_') && part.endsWith('_')) return <em key={j} className="text-[#667781] font-medium">{part.slice(1, -1)}</em>;
          return part;
        })}
      </span>
    ));
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'Burgers': return <Sandwich className="w-5 h-5" />;
      case 'Acompanhamentos': return <Package className="w-5 h-5" />;
      case 'Bebidas': return <CupSoda className="w-5 h-5" />;
      default: return <Utensils className="w-5 h-5" />;
    }
  };

  const currentCategoryIndex = CATEGORIES.indexOf(activeCategory);

  return (
    <div className="flex flex-col h-[100dvh] max-w-lg mx-auto bg-[#efeae2] shadow-2xl relative overflow-hidden ring-1 ring-black/5" role="main" aria-label="Burger & Co. Assistente de Pedidos">
      <div className="absolute inset-0 opacity-[0.08] pointer-events-none z-0" style={{ backgroundImage: `url(${WHATSAPP_BG})`, backgroundSize: '450px' }} aria-hidden="true"></div>

      {/* Offline indicator */}
      {!isOnline && (
        <div className="absolute top-0 left-0 right-0 bg-red-500 text-white text-center py-2 z-50 flex items-center justify-center gap-2 text-sm font-medium" role="alert">
          <WifiOff className="w-4 h-4" />
          Sem conexao com a internet
        </div>
      )}

      {/* Notifications */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 space-y-2" role="region" aria-label="Notificacoes">
        {notifications.map(notification => (
          <div
            key={notification.id}
            className={`animate-in slide-in-from-top-4 fade-in duration-300 p-3 px-4 rounded-xl shadow-lg flex items-center gap-3 ${
              notification.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' :
              notification.type === 'warning' ? 'bg-amber-50 border border-amber-200 text-amber-700' :
              notification.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' :
              'bg-blue-50 border border-blue-200 text-blue-700'
            }`}
            role="alert"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium flex-1">{notification.message}</span>
            {notification.dismissible && (
              <button
                onClick={() => dismissNotification(notification.id)}
                className="p-1 hover:bg-black/5 rounded-full transition-colors"
                aria-label="Fechar notificacao"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <header className="bg-[#075e54] px-4 py-3 flex items-center justify-between text-white shadow-lg z-20" role="banner">
        <div className="flex items-center gap-3">
          <div className="relative group">
            <div className="w-11 h-11 bg-white/15 rounded-full flex items-center justify-center border border-white/20 backdrop-blur-md group-hover:bg-white/25 transition-all" aria-hidden="true">
              <Bot className="text-white w-6 h-6" />
            </div>
            <div className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 border-2 border-[#075e54] rounded-full shadow-sm ${isChatClosed ? 'bg-gray-400' : 'bg-[#25d366] animate-pulse'}`} aria-hidden="true"></div>
          </div>
          <div>
            <h1 className="font-black text-[16px] leading-tight tracking-tight">{STORE_NAME}</h1>
            <p className="text-[11px] opacity-80 font-bold tracking-wide uppercase flex items-center gap-1.5" aria-live="polite">
               {isChatClosed ? 'Sessao Encerrada' : <><span className="w-1.5 h-1.5 bg-[#25d366] rounded-full animate-ping" aria-hidden="true"></span> Online agora</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end bg-white/10 px-3 py-1.5 rounded-2xl border border-white/10 backdrop-blur-sm">
             <span className="text-[9px] uppercase font-black opacity-70 tracking-widest">Previsao</span>
             <span className="text-[11px] font-black flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden="true" /> {ESTIMATED_TIME}</span>
          </div>
          {!isChatClosed && (
            <button
              onClick={handleExitChat}
              className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-full hover:bg-white/20 transition-all focus:outline-none focus:ring-2 focus:ring-white/50"
              title="Sair do chat"
              aria-label="Sair do chat"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {(flowStep === 'ordering' || showMenu) && !isChatClosed && (
        <nav className="bg-white border-b border-gray-200/60 shadow-sm z-10 px-2" aria-label="Categorias do cardapio">
           <div className="flex overflow-x-auto scrollbar-hide py-2 px-2 gap-2" role="tablist">
              {CATEGORIES.map((cat, index) => (
                 <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  role="tab"
                  aria-selected={activeCategory === cat}
                  aria-controls={`menu-${cat}`}
                  className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#075e54]/50 ${
                    activeCategory === cat
                      ? 'bg-[#075e54] text-white shadow-md scale-[1.02]'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                 >
                    {getCategoryIcon(cat)}
                    {cat}
                 </button>
              ))}
           </div>
           {/* Swipe indicator */}
           <div className="flex justify-center items-center gap-2 pb-2" aria-hidden="true">
             <ChevronLeft className={`w-4 h-4 ${currentCategoryIndex > 0 ? 'text-[#075e54]' : 'text-gray-300'}`} />
             <span className="text-[10px] text-gray-400 font-medium">Deslize para trocar</span>
             <ChevronRight className={`w-4 h-4 ${currentCategoryIndex < CATEGORIES.length - 1 ? 'text-[#075e54]' : 'text-gray-300'}`} />
           </div>
        </nav>
      )}

      <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-10 z-10 scrollbar-hide" role="log" aria-label="Mensagens do chat" aria-live="polite">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <article className={`group relative p-3 px-4 max-w-[88%] text-[15px] text-[#111b21] shadow-md animate-in fade-in slide-in-from-bottom-4 duration-500 ${msg.role === 'user' ? 'bg-[#d9fdd3] rounded-l-2xl rounded-br-2xl' : 'bg-white rounded-r-2xl rounded-bl-2xl'}`} aria-label={msg.role === 'user' ? 'Sua mensagem' : 'Mensagem do assistente'}>
               <div className={`absolute top-0 w-4 h-4 ${msg.role === 'user' ? '-right-2.5 text-[#d9fdd3]' : '-left-2.5 text-white'}`} aria-hidden="true">
                <svg viewBox="0 0 12 12" className="w-full h-full fill-current"><path d={msg.role === 'user' ? "M0 0 L12 0 L0 12 Z" : "M12 0 L0 0 L12 12 Z"} /></svg>
              </div>

              {msg.image && (
                <div className="mb-3 -mx-2 -mt-2 overflow-hidden rounded-xl border border-black/5 shadow-inner bg-gray-100">
                  <img
                    src={msg.image}
                    className="w-full h-auto max-h-64 object-cover hover:scale-105 transition-transform duration-700"
                    alt={`Imagem de ${msg.text.includes('*') ? msg.text.split('*')[1] : 'item do pedido'}`}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}

              <div className="leading-[1.5] relative whitespace-pre-wrap">
                {renderFormattedText(msg.text)}
              </div>

              <div className="flex items-center justify-end gap-1.5 mt-2 -mb-1 opacity-60">
                <time className="text-[10px] font-bold">{msg.timestamp}</time>
                {msg.role === 'user' && <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" aria-label="Mensagem enviada" />}
              </div>
            </article>
          </div>
        ))}
        {(isTyping || isSearchingCEP) && (
          <div className="flex w-full justify-start animate-in fade-in zoom-in duration-300" aria-live="polite" aria-busy="true">
            <div className="bg-white p-3 px-6 rounded-full shadow-lg flex items-center gap-3 border border-gray-100">
              {isSearchingCEP ? <Search className="w-4 h-4 animate-spin text-[#075e54]" aria-hidden="true" /> : <div className="flex gap-1.5" aria-hidden="true"><div className="w-1.5 h-1.5 bg-[#075e54]/30 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-[#075e54]/50 rounded-full animate-bounce [animation-delay:0.2s]"></div><div className="w-1.5 h-1.5 bg-[#075e54] rounded-full animate-bounce [animation-delay:0.4s]"></div></div>}
              <span className={`text-[11px] font-black text-[#075e54] uppercase tracking-tighter ${isSearchingCEP ? '' : 'sr-only'}`}>
                {isSearchingCEP ? 'Buscando CEP...' : 'Digitando...'}
              </span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </main>

      <footer className="bg-[#f0f2f5] p-3.5 z-20 border-t border-gray-300 shadow-[0_-12px_40px_rgba(0,0,0,0.08)]" role="contentinfo">
        {!isChatClosed ? (
          <>
            <div className="flex gap-2.5 overflow-x-auto pb-3 px-1 scrollbar-hide" role="group" aria-label="Acoes rapidas">
              {flowStep === 'ordering' && (
                <>
                  <button onClick={handleShowMenu} className="flex-shrink-0 bg-white border-2 border-gray-100 text-[#075e54] px-5 py-2.5 rounded-full text-[13px] font-black shadow-sm active:scale-95 transition-all flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#075e54]/50" aria-label="Ver cardapio completo">
                    <MenuIcon className="w-4 h-4" aria-hidden="true" /> Ver Cardapio
                  </button>
                  {cart.length > 0 && (
                    <button onClick={startCheckoutFlow} className="flex-shrink-0 bg-[#075e54] text-white px-5 py-2.5 rounded-full text-[13px] font-black shadow-lg flex items-center gap-2 transition-all hover:bg-[#128c7e] focus:outline-none focus:ring-2 focus:ring-[#075e54]/50" aria-label={`Finalizar pedido. Total: R$ ${totalValue.toFixed(2)}`}>
                      <ShoppingCart className="w-4 h-4" aria-hidden="true" /> Finalizar (R$ {totalValue.toFixed(2)})
                    </button>
                  )}
                </>
              )}

              {flowStep === 'ask_payment' && (
                <>
                  {["Pix", "Cartao", "Dinheiro"].map(pay => (
                    <button key={pay} onClick={() => handleSend(pay)} className="flex-shrink-0 bg-white border-2 border-gray-200 text-[#111b21] px-6 py-3 rounded-full text-sm font-black shadow-sm active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-[#075e54]/50" aria-label={`Pagar com ${pay}`}>{pay}</button>
                  ))}
                </>
              )}

              {flowStep === 'confirm_address' && (
                <>
                  <button onClick={() => handleSend('Sim')} className="flex-shrink-0 bg-[#25d366] text-white px-8 py-3 rounded-full text-sm font-black shadow-sm active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-[#25d366]/50" aria-label="Confirmar endereco">Sim, confirmo</button>
                  <button onClick={() => handleSend('Nao')} className="flex-shrink-0 bg-white border-2 border-gray-200 text-[#111b21] px-8 py-3 rounded-full text-sm font-black shadow-sm active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-gray-300" aria-label="Corrigir endereco">Nao, corrigir</button>
                </>
              )}

              {flowStep === 'edit_info' && (
                <>
                  <button onClick={() => { setEditField('name'); addMessage('bot', 'Digite o novo nome:'); }} className="flex-shrink-0 bg-white border-2 border-gray-200 text-[#111b21] px-4 py-2.5 rounded-full text-[12px] font-black shadow-sm active:scale-95 transition-all flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#075e54]/50" aria-label="Editar nome">
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" /> Nome
                  </button>
                  <button onClick={() => { setEditField('address'); addMessage('bot', 'Digite o novo endereco ou CEP:'); }} className="flex-shrink-0 bg-white border-2 border-gray-200 text-[#111b21] px-4 py-2.5 rounded-full text-[12px] font-black shadow-sm active:scale-95 transition-all flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#075e54]/50" aria-label="Editar endereco">
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" /> Endereco
                  </button>
                  <button onClick={() => { setEditField('payment'); addMessage('bot', 'Escolha a forma de pagamento:'); setFlowStep('ask_payment'); }} className="flex-shrink-0 bg-white border-2 border-gray-200 text-[#111b21] px-4 py-2.5 rounded-full text-[12px] font-black shadow-sm active:scale-95 transition-all flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#075e54]/50" aria-label="Editar forma de pagamento">
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" /> Pagamento
                  </button>
                  <button onClick={() => { setFlowStep('review'); showReviewMessage(userData); }} className="flex-shrink-0 bg-[#075e54] text-white px-4 py-2.5 rounded-full text-[12px] font-black shadow-sm active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-[#075e54]/50" aria-label="Continuar para revisao">
                    Continuar
                  </button>
                </>
              )}

              {flowStep === 'review' && (
                <div className="flex flex-col w-full gap-2">
                  <button onClick={startRedirection} className="w-full bg-[#25d366] text-white py-4 rounded-2xl font-black text-base shadow-xl flex items-center justify-center gap-3 active:scale-95 hover:bg-[#20c35e] transition-all focus:outline-none focus:ring-2 focus:ring-[#25d366]/50" aria-label="Confirmar pedido e enviar para WhatsApp">
                    CONFIRMAR E ENVIAR AO WHATSAPP <ChevronRight className="w-5 h-5" aria-hidden="true" />
                  </button>
                  <button onClick={goBackToEditing} className="w-full bg-white border-2 border-gray-200 text-[#111b21] py-3 rounded-2xl font-bold text-sm shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-gray-300" aria-label="Voltar para corrigir informacoes">
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar e Corrigir Informacoes
                  </button>
                </div>
              )}
            </div>

            {(flowStep === 'ordering' || showMenu) && (
                 <div
                   ref={menuContainerRef}
                   id={`menu-${activeCategory}`}
                   role="tabpanel"
                   aria-label={`Itens de ${activeCategory}`}
                   className="grid grid-cols-2 gap-3 py-1 px-1 mb-3 max-h-[340px] overflow-y-auto scrollbar-hide"
                   onTouchStart={onTouchStart}
                   onTouchMove={onTouchMove}
                   onTouchEnd={onTouchEnd}
                 >
                    {MENU.filter(m => m.category === activeCategory).map(item => {
                        const cartItem = cart.find(i => i.id === item.id);
                        return (
                            <article key={item.id} className="flex flex-col justify-between bg-white p-3 rounded-[20px] border border-gray-100 shadow-sm hover:border-[#075e54]/40 transition-all group active:scale-[0.98]" aria-label={`${item.name}, R$ ${item.price.toFixed(2)}`}>
                                <div className="flex justify-between items-start gap-2 mb-2">
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[13px] font-black text-[#111b21] leading-tight group-hover:text-[#075e54] transition-colors line-clamp-2">{item.name}</span>
                                    <span className="text-[12px] text-[#075e54] font-black bg-[#075e54]/5 self-start px-1.5 py-0.5 rounded-md">R$ {item.price.toFixed(2)}</span>
                                  </div>
                                   <button onClick={() => handleShowImage(item.name)} aria-label={`Ver imagem de ${item.name}`} className="w-7 h-7 flex-shrink-0 flex items-center justify-center text-gray-400 hover:text-[#075e54] bg-gray-50 rounded-full hover:bg-[#075e54]/10 transition-all focus:outline-none focus:ring-2 focus:ring-[#075e54]/50">
                                      {generatingAssets[`img-${item.name}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-label="Carregando imagem" /> : <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />}
                                   </button>
                                </div>

                                <div className="flex items-center justify-between bg-[#f0f2f5] rounded-full p-1 border border-gray-200" role="group" aria-label={`Quantidade de ${item.name}`}>
                                  <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-white rounded-full transition-all active:scale-75 focus:outline-none focus:ring-2 focus:ring-red-300" aria-label={`Remover um ${item.name}`} disabled={!cartItem}><Minus className="w-3.5 h-3.5" /></button>
                                  <span className="text-[13px] font-black flex-1 text-center text-[#111b21]" aria-live="polite">{cartItem?.quantity || 0}</span>
                                  <button onClick={() => addToCart(item)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-[#075e54] hover:bg-white rounded-full transition-all active:scale-75 focus:outline-none focus:ring-2 focus:ring-[#075e54]/50" aria-label={`Adicionar um ${item.name}`}><Plus className="w-3.5 h-3.5" /></button>
                                </div>
                            </article>
                        );
                    })}
                 </div>
            )}

            {['ordering', 'ask_name', 'ask_address', 'ask_address_number', 'ask_payment', 'confirm_address', 'edit_info'].includes(flowStep) && (
                <div className="flex items-center gap-3 px-1 py-1">
                    <div className="flex-1 bg-white rounded-[26px] flex items-center px-5 py-3.5 shadow-lg border border-gray-200 relative overflow-hidden transition-all focus-within:ring-4 ring-[#075e54]/10">
                        {isRecording && (
                          <div className="absolute inset-0 bg-white flex items-center px-5 gap-4 text-[#075e54] font-black z-10 animate-in fade-in slide-in-from-left-4" aria-live="polite">
                             <div className="relative flex items-center justify-center" aria-hidden="true">
                                <Circle className="w-4 h-4 fill-red-500 text-red-500 animate-pulse" />
                                <div className="absolute w-8 h-8 border-2 border-red-500/20 rounded-full animate-ping"></div>
                             </div>
                             <span className="flex-1 animate-pulse truncate text-[15px] tracking-tight">{inputText || 'Diga o que voce deseja...'}</span>
                          </div>
                        )}
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                            placeholder={flowStep === 'ask_address' ? "CEP ou endereco..." : flowStep === 'ask_name' ? "Seu nome..." : flowStep === 'ask_address_number' ? "Numero e complemento..." : "Digite aqui..."}
                            className="flex-1 outline-none text-[16px] text-[#111b21] bg-transparent placeholder:text-gray-400 font-medium"
                            aria-label={flowStep === 'ask_address' ? "Digite seu CEP ou endereco" : flowStep === 'ask_name' ? "Digite seu nome" : flowStep === 'ask_address_number' ? "Digite o numero e complemento" : "Digite sua mensagem"}
                            disabled={isChatClosed}
                        />
                    </div>

                    <button
                        onMouseDown={inputText.trim() ? undefined : startVoiceRecording}
                        onMouseUp={inputText.trim() ? undefined : stopVoiceRecording}
                        onTouchStart={inputText.trim() ? undefined : startVoiceRecording}
                        onTouchEnd={inputText.trim() ? undefined : stopVoiceRecording}
                        onClick={inputText.trim() ? () => handleSend() : undefined}
                        className={`w-14 h-14 min-w-[56px] min-h-[56px] rounded-full flex items-center justify-center shadow-xl transition-all duration-300 hover:scale-105 active:scale-90 focus:outline-none focus:ring-4 focus:ring-[#075e54]/30 ${inputText.trim() ? 'bg-[#075e54] rotate-0' : (isRecording ? 'bg-red-500 ring-8 ring-red-500/10' : 'bg-[#075e54]')}`}
                        aria-label={inputText.trim() ? 'Enviar mensagem' : (isRecording ? 'Parar gravacao' : 'Iniciar gravacao de voz')}
                        disabled={isChatClosed}
                    >
                        {inputText.trim() ? <Send className="w-6 h-6 text-white ml-0.5" /> : (isRecording ? <MicOff className="w-6 h-6 text-white animate-pulse" /> : <Mic className="w-6 h-6 text-white" />)}
                    </button>
                    {voiceSupported && !inputText.trim() && !isRecording && (
                      <span className="sr-only">Segure o botao do microfone para gravar</span>
                    )}
                </div>
            )}

            {flowStep === 'finished' && (
                <div className="w-full space-y-4 py-4 px-2 animate-in slide-in-from-bottom-5 duration-700" role="status" aria-live="polite">
                  <div className="flex justify-between text-[12px] font-black text-[#075e54] uppercase tracking-widest px-1">
                    <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Conectando WhatsApp</span>
                    <span>{redirectionProgress}%</span>
                  </div>
                  <div className="h-4 bg-gray-200 rounded-full overflow-hidden shadow-inner p-0.5 border border-gray-300" role="progressbar" aria-valuenow={redirectionProgress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-gradient-to-r from-[#25d366] to-[#128c7e] rounded-full transition-all duration-100 shadow-[0_0_15px_rgba(37,211,102,0.5)]" style={{ width: `${redirectionProgress}%` }}></div>
                  </div>
                </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 px-6 gap-5 bg-white/95 backdrop-blur-3xl rounded-[32px] border border-gray-200 shadow-2xl animate-in zoom-in-95 duration-700" role="status">
            <div className="w-20 h-20 bg-[#075e54]/10 rounded-full flex items-center justify-center ring-8 ring-[#075e54]/5 relative" aria-hidden="true">
              <ClipboardCheck className="w-10 h-10 text-[#075e54]" />
              <div className="absolute -top-1 -right-1 bg-[#25d366] text-white p-1.5 rounded-full shadow-lg"><CheckCheck className="w-4 h-4" /></div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="font-black text-[22px] text-[#111b21] tracking-tight">Pedido Enviado!</h2>
              <p className="text-sm text-gray-500 font-medium leading-relaxed px-2">Nossa equipe ja recebeu seu pedido. Voce foi redirecionado para o WhatsApp.</p>
            </div>
            <div className="w-full flex flex-col gap-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full flex items-center justify-center gap-3 bg-[#075e54] text-white text-[15px] font-black py-4 rounded-2xl hover:bg-[#128c7e] shadow-xl transition-all active:scale-95 focus:outline-none focus:ring-4 focus:ring-[#075e54]/30"
                aria-label="Fazer um novo pedido"
              >
                <RefreshCw className="w-5 h-5" aria-hidden="true" /> FAZER NOVO PEDIDO
              </button>
              <p className="text-[10px] text-gray-400 text-center font-bold uppercase tracking-widest">Burger & Co. Delivery System v2.0</p>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
};

export default App;
