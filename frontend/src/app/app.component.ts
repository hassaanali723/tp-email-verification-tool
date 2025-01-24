import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { fadeAnimation } from './route-animations'; 

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  animations: [fadeAnimation]
})
export class AppComponent {
  title = 'email-verification-tool';
}