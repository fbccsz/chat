
export type Role = 'bot' | 'user';

export interface MenuItem {
  id: number;
  name: string;
  price: number;
  category: string;
}

export interface Message {
  id: string;
  role: Role;
  text: string;
  timestamp: string;
  image?: string;
  audio?: string;
  isAudioPlaying?: boolean;
}

export interface CartItem extends MenuItem {
  quantity: number;
}

export interface UserData {
  name: string;
  address: string;
  paymentMethod: string;
}

export interface ButtonOption {
  label: string;
  prompt: string;
  icon?: string;
  action?: () => void;
}
