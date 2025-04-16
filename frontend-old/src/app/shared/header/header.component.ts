// src/app/shared/layout/header/header.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="header">
      <div class="header-left">
        <h1 class="page-title">{{pageTitle}}</h1>
      </div>
      
      <div class="header-right">
        <div class="credits">
          <span class="credits-label">Credits:</span>
          <span class="credits-amount">86</span>
        </div>
        
        <button class="buy-credits-btn">
          Buy Credits
        </button>
        
        <div class="user-avatar">
          H
        </div>
      </div>
    </header>
  `,
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  pageTitle = 'Dashboard';
}