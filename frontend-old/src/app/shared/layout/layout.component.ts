// src/app/shared/layout/layout.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { HeaderComponent } from '../header/header.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterModule, SidebarComponent, HeaderComponent],
  template: `
    <div class="layout-container">
      <app-sidebar></app-sidebar>
      
      <div class="main-content">
        <app-header></app-header>
        
        <main class="content-area">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {}