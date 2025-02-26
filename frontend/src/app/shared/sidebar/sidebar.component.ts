//src/app/shared/layout/sidebar/sidebar.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <aside class="sidebar">
      <div class="brand">
        <h1>TARGETPULSE</h1>
      </div>
      
      <nav class="navigation">
        <a routerLink="/dashboard" routerLinkActive="active" class="nav-item">
          <span class="icon dashboard"></span>
          Dashboard
        </a>
        
        <a routerLink="/validate" routerLinkActive="active" class="nav-item">
          <span class="icon check_circle"></span>
          Validate
        </a>

        <a routerLink="/pricing" routerLinkActive="active" class="nav-item">
          <span class="icon attach_money"></span>
          Pricing
        </a>

        <a routerLink="/account" routerLinkActive="active" class="nav-item">
          <span class="icon person"></span>
          Account
        </a>

        <a routerLink="/integration" routerLinkActive="active" class="nav-item">
          <span class="icon settings"></span>
          Integration
        </a>
      </nav>
    </aside>
  `,
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {}