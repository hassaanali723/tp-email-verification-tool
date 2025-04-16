// route-animations.ts
import { trigger, transition, style, animate } from '@angular/animations';
import { provideAnimations } from '@angular/platform-browser/animations';
export const fadeAnimation = trigger('fadeAnimation', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('300ms', style({ opacity: 1 })),
  ]),
  transition(':leave', [
    animate('300ms', style({ opacity: 0 })),
  ]),
]);