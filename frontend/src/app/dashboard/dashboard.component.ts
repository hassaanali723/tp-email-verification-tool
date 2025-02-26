//src/app/dashboard/dashboard.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="dashboard-container">
      <!-- Trial Notice -->
      <div class="trial-notice" *ngIf="showTrial">
        <div class="notice-content">
          <span class="icon info"></span>
          <span>Your free trial ends on February 27, 2025</span>
        </div>
        <button class="close-button" (click)="dismissTrial()">
          <span class="icon close"></span>
        </button>
      </div>

      <h1 class="welcome-message">Welcome Hassaan Ali!</h1>

      <div class="dashboard-grid">
        <!-- Validate Risky Emails Card -->
        <div class="dashboard-card">
          <div class="card-header">
            <span class="icon check_circle"></span>
            <h2>Validate Risky Emails</h2>
          </div>
          
          <p class="card-description">
            Upload a CSV of your prospect's emails and receive the valid emails directly in your inbox.
          </p>

          <button routerLink="/validate" class="validate-button">
            Validate Email List
          </button>

          <p class="file-limits">
            Max: 10,000 records, Max file-size: 50MB
          </p>
        </div>

        <!-- Quick Stats Card -->
        <div class="dashboard-card">
          <div class="card-header">
            <span class="icon bar_chart"></span>
            <h2>Quick Stats</h2>
          </div>

          <p class="time-period">Last 30 days</p>

          <ul class="stats-list">
            <li>
              <span class="icon check_circle success"></span>
              You've recovered 0 of your email list in the last 30 days
            </li>
            <li>
              <span class="icon check_circle success"></span>
              You've validated 14 risky emails in the last 30 days
            </li>
          </ul>
        </div>

        <!-- Recent Activity -->
        <div class="dashboard-card">
          <div class="card-header">
            <span class="icon history"></span>
            <h2>Recent Activity</h2>
          </div>

          <div class="activity-list">
            <div *ngFor="let activity of recentActivity" class="activity-item">
              <div class="activity-info">
                <span class="icon" [ngClass]="activity.icon"></span>
                <div class="activity-details">
                  <p class="activity-title">{{activity.title}}</p>
                  <p class="activity-time">{{activity.time}}</p>
                </div>
              </div>
              <span class="status-badge" [ngClass]="activity.statusClass">
                {{activity.status}}
              </span>
            </div>
          </div>
        </div>

        <!-- Usage Stats -->
        <div class="dashboard-card">
          <div class="card-header">
            <span class="icon data_usage"></span>
            <h2>Usage Stats</h2>
          </div>

          <div class="usage-stats">
            <div class="stat-item">
              <div class="stat-header">
                <span>Credits Used</span>
                <span>14 / 100</span>
              </div>
              <div class="progress-bar">
                <div class="progress-value" style="width: 14%"></div>
              </div>
            </div>

            <div class="stat-item">
              <div class="stat-header">
                <span>Storage Used</span>
                <span>2.1 MB / 50 MB</span>
              </div>
              <div class="progress-bar">
                <div class="progress-value secondary" style="width: 4.2%"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  showTrial = true;

  recentActivity = [
    {
      title: 'Validated email list',
      time: '2 hours ago',
      status: 'Completed',
      statusClass: 'status-success',
      icon: 'check_circle success'
    },
    {
      title: 'Uploaded new list',
      time: '5 hours ago',
      status: 'Processing',
      statusClass: 'status-processing',
      icon: 'cloud_upload processing'
    },
    {
      title: 'Credits purchased',
      time: '1 day ago',
      status: 'Success',
      statusClass: 'status-success',
      icon: 'payment warning'
    }
  ];

  dismissTrial() {
    this.showTrial = false;
  }
}