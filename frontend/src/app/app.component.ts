import { Component } from '@angular/core';
import { EmailValidationComponent } from './email-validation/email-validation.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [EmailValidationComponent], // Import the EmailValidationComponent here
})
export class AppComponent {}
