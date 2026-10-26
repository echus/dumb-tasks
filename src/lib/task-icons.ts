import type { Component } from 'svelte';
import BookOpen from '@lucide/svelte/icons/book-open';
import Baby from '@lucide/svelte/icons/baby';
import Bike from '@lucide/svelte/icons/bike';
import Briefcase from '@lucide/svelte/icons/briefcase';
import Cake from '@lucide/svelte/icons/cake';
import Calendar from '@lucide/svelte/icons/calendar';
import Camera from '@lucide/svelte/icons/camera';
import Car from '@lucide/svelte/icons/car';
import Cat from '@lucide/svelte/icons/cat';
import Code from '@lucide/svelte/icons/code';
import CreditCard from '@lucide/svelte/icons/credit-card';
import Dog from '@lucide/svelte/icons/dog';
import Dumbbell from '@lucide/svelte/icons/dumbbell';
import FileText from '@lucide/svelte/icons/file-text';
import Fuel from '@lucide/svelte/icons/fuel';
import Gift from '@lucide/svelte/icons/gift';
import GraduationCap from '@lucide/svelte/icons/graduation-cap';
import HeartPulse from '@lucide/svelte/icons/heart-pulse';
import House from '@lucide/svelte/icons/house';
import KeyboardMusic from '@lucide/svelte/icons/keyboard-music';
import Landmark from '@lucide/svelte/icons/landmark';
import Laptop from '@lucide/svelte/icons/laptop';
import Lightbulb from '@lucide/svelte/icons/lightbulb';
import Mail from '@lucide/svelte/icons/mail';
import Package from '@lucide/svelte/icons/package';
import Paintbrush from '@lucide/svelte/icons/paintbrush';
import PenLine from '@lucide/svelte/icons/pen-line';
import Phone from '@lucide/svelte/icons/phone';
import Pill from '@lucide/svelte/icons/pill';
import Plane from '@lucide/svelte/icons/plane';
import Presentation from '@lucide/svelte/icons/presentation';
import Receipt from '@lucide/svelte/icons/receipt';
import Scissors from '@lucide/svelte/icons/scissors';
import Shirt from '@lucide/svelte/icons/shirt';
import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
import Sofa from '@lucide/svelte/icons/sofa';
import Sprout from '@lucide/svelte/icons/sprout';
import Stethoscope from '@lucide/svelte/icons/stethoscope';
import Trash from '@lucide/svelte/icons/trash';
import Users from '@lucide/svelte/icons/users';
import Utensils from '@lucide/svelte/icons/utensils';
import Wallet from '@lucide/svelte/icons/wallet';
import WashingMachine from '@lucide/svelte/icons/washing-machine';
import Wrench from '@lucide/svelte/icons/wrench';

// Imported one by one so the bundle only carries icons the guesser can pick.
export const TASK_ICONS: Record<string, Component<{ size?: number | string }>> = {
  'baby': Baby,
  'bike': Bike,
  'book-open': BookOpen,
  'briefcase': Briefcase,
  'cake': Cake,
  'calendar': Calendar,
  'camera': Camera,
  'car': Car,
  'cat': Cat,
  'code': Code,
  'credit-card': CreditCard,
  'dog': Dog,
  'dumbbell': Dumbbell,
  'file-text': FileText,
  'fuel': Fuel,
  'gift': Gift,
  'graduation-cap': GraduationCap,
  'heart-pulse': HeartPulse,
  'house': House,
  'keyboard-music': KeyboardMusic,
  'landmark': Landmark,
  'laptop': Laptop,
  'lightbulb': Lightbulb,
  'mail': Mail,
  'package': Package,
  'paintbrush': Paintbrush,
  'pen-line': PenLine,
  'phone': Phone,
  'pill': Pill,
  'plane': Plane,
  'presentation': Presentation,
  'receipt': Receipt,
  'scissors': Scissors,
  'shirt': Shirt,
  'shopping-cart': ShoppingCart,
  'sofa': Sofa,
  'sprout': Sprout,
  'stethoscope': Stethoscope,
  'trash': Trash,
  'users': Users,
  'utensils': Utensils,
  'wallet': Wallet,
  'washing-machine': WashingMachine,
  'wrench': Wrench,
};
