import { Routes } from '@angular/router';
import { EmailValidationComponent } from './email-validation/email-validation.component';
import { EmailResultsComponent } from './email-results/email-results.component';

export const routes: Routes = [
  { path: '', redirectTo: '/email-validation', pathMatch: 'full' },
  { path: 'email-validation', component: EmailValidationComponent },
  { path: 'email-validation/results/:id', component: EmailResultsComponent },
//   { path: '**', redirectTo: '/email-validation' } // Wildcard route for 404
];