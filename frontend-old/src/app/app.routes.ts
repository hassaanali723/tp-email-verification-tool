// import { Routes } from '@angular/router';
// import { EmailValidationComponent } from './email-validation/email-validation.component';
// import { EmailResultsComponent } from './email-results/email-results.component';
// import { LayoutComponent } from './shared/layout/sidebar/sidebar.component';
// // import { DashboardComponent } from './dashboard/dashboard.component';

// export const routes: Routes = [
//   { path: '', redirectTo: '/email-validation', pathMatch: 'full' },
//   { path: 'email-validation', component: EmailValidationComponent },
//   { path: 'email-validation/results/:id', component: EmailResultsComponent },
// //   { path: '**', redirectTo: '/email-validation' } // Wildcard route for 404
// ];

// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { EmailValidationComponent } from './email-validation/email-validation.component';
import { EmailResultsComponent } from './email-results/email-results.component';
import { LayoutComponent } from './shared/layout/layout.component'; // Fix the import path
import { DashboardComponent } from './dashboard/dashboard.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      {
        path: 'dashboard',
        component: DashboardComponent  // Add the component directly since we have it
      },
      {
        path: 'validate',
        component: EmailValidationComponent // Changed to direct component for now
      },
      {
        path: 'email-validation/results/:id',
        component: EmailResultsComponent
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  }
];