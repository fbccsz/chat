
import { MenuItem } from './types';

export const STORE_NAME = "Burger & Co.";
export const STORE_PHONE = "5571984829910";
export const DELIVERY_FEE = 7.00;
export const ESTIMATED_TIME = "30-50 min";

export const MENU: MenuItem[] = [
  { id: 1, name: "X-Burger Clássico", price: 25.00, category: "Burgers" },
  { id: 2, name: "X-Bacon Cheddar", price: 32.00, category: "Burgers" },
  { id: 3, name: "Smash Duplo", price: 28.00, category: "Burgers" },
  { id: 4, name: "Vegetariano Soul", price: 30.00, category: "Burgers" },
  { id: 5, name: "Batata Frita", price: 15.00, category: "Acompanhamentos" },
  { id: 6, name: "Onion Rings", price: 18.00, category: "Acompanhamentos" },
  { id: 7, name: "Nuggets (10 unidades)", price: 20.00, category: "Acompanhamentos" },
  { id: 8, name: "Refrigerante Lata", price: 6.00, category: "Bebidas" },
  { id: 9, name: "Suco Natural", price: 10.00, category: "Bebidas" },
  { id: 10, name: "Água Mineral", price: 4.00, category: "Bebidas" }
];

export const CATEGORIES = ["Burgers", "Acompanhamentos", "Bebidas"];

export const WHATSAPP_BG = "https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png";

export const SYSTEM_PROMPT = `
Você é um assistente virtual da hamburgueria "${STORE_NAME}".
SUA FUNÇÃO: Ajudar o cliente a escolher itens e tirar dúvidas sobre o cardápio.

REGRAS RÍGIDAS (NÃO QUEBRE):
1. **VOCÊ NÃO ANOTA PEDIDOS**: O cliente DEVE adicionar os itens clicando nos botões "+" e "-" do cardápio visual na tela. Se o cliente disser "quero um X-Burger", responda: "Ótima escolha! Por favor, adicione ele clicando no botão '+' aqui no cardápio abaixo 👇".
2. **SEJA CURTO**: Respostas de no máximo 2 frases. Use emojis (🍔, 😋).
3. **SUGESTÕES**: Se pedirem indicação, sugira o "X-Bacon Cheddar".
4. **CONTEXTO**: Lembre-se do que já foi falado.
5. **FINALIZAÇÃO**: Se o cliente disser que acabou ou quer fechar, diga para clicar no botão "Finalizar" ou "Carrinho".

IMPORTANTE: Nunca diga "anotei seu pedido". Diga "adicione ao carrinho visual".
`;
