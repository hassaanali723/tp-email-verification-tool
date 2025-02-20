import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

interface ValidationStats {
  count: number;
  percentage: number;
}

interface Stats {
  deliverable: ValidationStats;
  undeliverable: ValidationStats;
  risky: ValidationStats;
  unknown: ValidationStats;
  duplicate: ValidationStats;
}

interface Subcategory {
  name: string;
  count: number;
}

@Component({
  selector: 'app-email-results',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './email-results.component.html',
  styleUrls: ['./email-results.component.scss']
})
export class EmailResultsComponent implements OnInit {
  fileName: string = '';
  uploadDate: string = '';
  totalEmails: number = 0;
  fileId: string = '';
  
  stats: Stats = {
    deliverable: { count: 0, percentage: 0 },
    undeliverable: { count: 0, percentage: 0 },
    risky: { count: 0, percentage: 0 },
    unknown: { count: 0, percentage: 0 },
    duplicate: { count: 0, percentage: 0 }
  };

  undeliverableSubcategories: Subcategory[] = [
    { name: 'Invalid Email', count: 0 },
    { name: 'Invalid Domain', count: 0 },
    { name: 'Rejected Email', count: 0 },
    { name: 'Invalid SMTP', count: 0 }
  ];

  riskySubcategories: Subcategory[] = [
    { name: 'Low Quality', count: 0 },
    { name: 'Low Deliverability', count: 0 }
  ];

  unknownSubcategories: Subcategory[] = [
    { name: 'No Connect', count: 0 },
    { name: 'Timeout', count: 0 },
    { name: 'Unavailable SMTP', count: 0 },
    { name: 'Unexpected Error', count: 0 }
  ];

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.fileId = params['id'];
      if (this.fileId) {
        this.loadResults(this.fileId);
      }
    });
  }

  loadResults(fileId: string): void {
    this.http.get<any>(`http://localhost:5000/api/emails/results/${fileId}`)
      .subscribe({
        next: (response) => {
          this.fileName = response.fileName;
          this.uploadDate = response.processedAt;
          this.totalEmails = response.stats.totalEmails;
  
          // Update main stats
          this.stats = {
            deliverable: {
              count: response.stats.deliverable,
              percentage: parseFloat(response.stats.percentages.deliverable)
            },
            undeliverable: {
              count: response.stats.undeliverable,
              percentage: parseFloat(response.stats.percentages.undeliverable)
            },
            risky: {
              count: response.stats.risky,
              percentage: parseFloat(response.stats.percentages.risky)
            },
            unknown: {
              count: response.stats.unknown,
              percentage: parseFloat(response.stats.percentages.unknown)
            },
            duplicate: {
              count: response.stats.duplicate,
              percentage: parseFloat(response.stats.percentages.duplicate)
            }
          };
  
          // Update subcategories
          this.undeliverableSubcategories = [
            { name: 'Invalid Email', count: response.stats.details.undeliverable.invalidEmail },
            { name: 'Invalid Domain', count: response.stats.details.undeliverable.invalidDomain },
            { name: 'Rejected Email', count: response.stats.details.undeliverable.rejectedEmail },
            { name: 'Invalid SMTP', count: response.stats.details.undeliverable.invalidSMTP }
          ];
  
          this.riskySubcategories = [
            { name: 'Low Quality', count: response.stats.details.risky.lowQuality },
            { name: 'Low Deliverability', count: response.stats.details.risky.lowDeliverability }
          ];
  
          this.unknownSubcategories = [
            { name: 'No Connect', count: response.stats.details.unknown.noConnect },
            { name: 'Timeout', count: response.stats.details.unknown.timeout },
            { name: 'Unavailable SMTP', count: response.stats.details.unknown.unavailableSMTP },
            { name: 'Unexpected Error', count: response.stats.details.unknown.unexpectedError }
          ];
  
          // Set chart variables for visualization
          this.setChartVariables();
        },
        error: (error) => {
          console.error('Error loading results:', error);
        }
      });

      
  }
  private resetStats(): void {
    Object.keys(this.stats).forEach(key => {
      this.stats[key as keyof Stats].count = 0;
      this.stats[key as keyof Stats].percentage = 0;
    });

    this.undeliverableSubcategories.forEach(sub => sub.count = 0);
    this.riskySubcategories.forEach(sub => sub.count = 0);
    this.unknownSubcategories.forEach(sub => sub.count = 0);
  }

  private calculatePercentages(): void {
    Object.keys(this.stats).forEach(key => {
      this.stats[key as keyof Stats].percentage = 
        (this.stats[key as keyof Stats].count / this.totalEmails) * 100;
    });
  }

  private setChartVariables(): void {
    const style = document.documentElement.style;
    let currentAngle = 0;

    Object.keys(this.stats).forEach(key => {
      const percentage = this.stats[key as keyof Stats].percentage;
      const angle = (percentage / 100) * 360;
      style.setProperty(`--${key}-angle`, `${currentAngle + angle}deg`);
      currentAngle += angle;
    });
  }
}