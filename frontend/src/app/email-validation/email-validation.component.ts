// email-validation.component.ts
import { Component } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';

interface EmailValidation {
  email: string;
  isValid: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  deliverabilityScore: number;
  _id: string;
}

interface ProcessFileResponse {
  status: string;
  savedDocument: {
    fileId: string;
    emailColumn: string;
    processedAt: string;
    validations: EmailValidation[];
  };
}

interface EmailList {
  fileName: string;
  fileId: string;
  emailsReady: number;
  status: 'uploaded' | 'verified';
  validationResults: EmailValidation[];
  deliverableRate?: number;
}

interface UploadResponse {
  message: string;
  fileId: string;
}

@Component({
  selector: 'app-email-validation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './email-validation.component.html',
  styleUrls: ['./email-validation.component.scss']
})
export class EmailValidationComponent {
  lists: EmailList[] = [];
  errorMessage: string = '';
  isProcessing: boolean = false;

  constructor(private http: HttpClient) {}

  onFileSelected(event: any): void {
    const file: File = event.target.files[0];
    if (!file) return;

    // Clear previous error message
    this.errorMessage = '';

    // Check file type
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      this.errorMessage = 'Please upload only Excel or CSV files.';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    this.http.post<UploadResponse>('http://localhost:5000/api/files/upload', formData)
      .subscribe({
        next: (response) => {
          console.log('Upload response:', response);
          if (response.fileId) {
            this.lists.push({
              fileName: file.name,
              fileId: response.fileId,
              emailsReady: 0, // Will be updated after processing
              status: 'uploaded',
              validationResults: []
            });
          }
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error uploading file:', error);
          this.errorMessage = 'Failed to upload file. Please try again.';
        }
      });
  }

  verifyFile(list: EmailList): void {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.errorMessage = '';

    const payload = { 
      fileId: list.fileId, 
      emailColumn: "Email" 
    };

    this.http.post<ProcessFileResponse>('http://localhost:5000/api/emails/process-file', payload)
      .subscribe({
        next: (response) => {
          console.log('Verification response:', response);
          const index = this.lists.findIndex(item => item.fileId === list.fileId);
          if (index !== -1 && response.status === 'success') {
            // Calculate deliverable rate
            const validEmails = response.savedDocument.validations.filter(
              v => v.isValid && v.deliverabilityScore >= 90
            ).length;
            const deliverableRate = (validEmails / response.savedDocument.validations.length) * 100;

            this.lists[index] = {
              ...list,
              status: 'verified',
              validationResults: response.savedDocument.validations,
              deliverableRate: Math.round(deliverableRate),
              emailsReady: response.savedDocument.validations.length
            };
          }
          this.isProcessing = false;
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error verifying file:', error);
          this.errorMessage = 'Failed to verify file. Please try again.';
          this.isProcessing = false;
        }
      });
  }

  viewResults(list: EmailList): void {
    console.log('Validation Results:', list.validationResults);
    // Implement results view logic here
    // You might want to navigate to a new route or open a modal
    // showing the detailed validation results
  }

  calculateDeliverabilityStats(validations: EmailValidation[]) {
    const stats = {
      totalEmails: validations.length,
      deliverable: 0,
      risky: 0,
      undeliverable: 0
    };

    validations.forEach(validation => {
      if (validation.isValid && validation.deliverabilityScore >= 90) {
        stats.deliverable++;
      } else if (validation.isValid && validation.deliverabilityScore >= 70) {
        stats.risky++;
      } else {
        stats.undeliverable++;
      }
    });

    return stats;
  }
}