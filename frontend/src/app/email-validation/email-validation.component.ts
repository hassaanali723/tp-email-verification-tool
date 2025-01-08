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

  ngOnInit() {
    this.loadFiles();
  }

  loadFiles() {
    this.http.get<EmailList[]>('http://localhost:5000/api/files/list')
      .subscribe({
        next: (files) => {
          this.lists = files;
        },
        error: (error) => {
          console.error('Error loading files:', error);
          this.errorMessage = 'Failed to load files.';
        }
      });
  }

  onFileSelected(event: any): void {
    const file: File = event.target.files[0];
    if (!file) return;

    this.errorMessage = '';
    const formData = new FormData();
    formData.append('file', file);

    this.http.post<UploadResponse>('http://localhost:5000/api/files/upload', formData)
      .subscribe({
        next: (response) => {
          console.log('Upload response:', response);
          if (response.fileId) {
            // Instead of manually pushing, reload the entire list
            this.loadFiles();
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

  // Add this method to your component class
deleteFile(fileId: string): void {
  if (confirm('Are you sure you want to delete this file?')) {
    this.http.delete(`http://localhost:5000/api/files/${fileId}`)
      .subscribe({
        next: () => {
          // Remove file from local list
          this.lists = this.lists.filter(list => list.fileId !== fileId);
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error deleting file:', error);
          this.errorMessage = 'Failed to delete file. Please try again.';
        }
      });
  }
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