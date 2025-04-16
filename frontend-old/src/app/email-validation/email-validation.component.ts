// email-validation.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterOutlet, RouterModule } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { interval, Subscription } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';

interface EmailValidation {
  email: string;
  isValid: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  deliverabilityScore: number;
  _id: string;
}

interface ProcessFileResponse {
  status: string;
  message: string;
  jobId: string;
  validationId: string; 
  totalEmails: number;
}

interface ValidationStatus {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  processedAt: string;
  fileId: string;
  error?: string;
}

interface EmailList {
  fileName: string;
  fileId: string;
  emailsReady: number;
  status: 'uploaded' | 'verified' | 'processing' | 'queued' | 'failed' | 'completed';
  validationResults: any[];
  deliverableRate?: number;
  isProcessing?: boolean;
  progress?: number;
  validationId?: string;
  error?: string;
}

interface UploadResponse {
  message: string;
  fileId: string;
}

@Component({
  selector: 'app-email-validation',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterModule],
  templateUrl: './email-validation.component.html',
  styleUrls: ['./email-validation.component.scss']
})
export class EmailValidationComponent implements OnInit, OnDestroy {
  lists: EmailList[] = [];
  errorMessage: string = '';
  isProcessing: boolean = false;
  private pollingSubscriptions: { [key: string]: Subscription } = {};

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit() {
    this.loadFiles();
  }

  ngOnDestroy() {
    // Clean up all polling subscriptions
    Object.values(this.pollingSubscriptions).forEach(subscription => {
      if (subscription) {
        subscription.unsubscribe();
      }
    });
  }

  loadFiles() {
    this.http.get<EmailList[]>('http://localhost:5000/api/files/list')
      .subscribe({
        next: (files) => {
          this.lists = files;
          
          // Start polling for any files that are still processing
          this.lists.forEach(file => {
            if (file.status === 'processing' || file.status === 'queued') {
              this.startPollingStatus(file);
            }
          });
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
    if (list.isProcessing) return;
  
    // Update the processing state for this specific file
    const index = this.lists.findIndex(item => item.fileId === list.fileId);
    if (index !== -1) {
      this.lists[index] = {
        ...list,
        isProcessing: true,
        status: 'processing',
        progress: 0
      };
    }
  
    const payload = { 
      fileId: list.fileId, 
      emailColumn: "Email" 
    };
  
    this.http.post<ProcessFileResponse>('http://localhost:5000/api/emails/process-file', payload)
      .subscribe({
        next: (response) => {
          console.log('Verification response:', response);
          const index = this.lists.findIndex(item => item.fileId === list.fileId);
          
          if (index !== -1) {
            this.lists[index] = {
              ...list,
              status: (response.status as any) === 'completed' ? 'verified' : (response.status as 'uploaded' | 'verified' | 'processing' | 'queued' | 'failed' | 'completed'),
              progress: 0,
              validationId: response.validationId,
              isProcessing: response.status === 'processing' || response.status === 'queued'
            };
            
            // Start polling for status updates
            if (response.status === 'processing' || response.status === 'queued') {
              this.startPollingStatus(this.lists[index]);
            }
          }
        },
        error: (error: HttpErrorResponse) => {
          console.error('Error verifying file:', error);
          this.errorMessage = 'Failed to verify file. Please try again.';
          
          // Reset the processing state for this file on error
          const index = this.lists.findIndex(item => item.fileId === list.fileId);
          if (index !== -1) {
            this.lists[index] = {
              ...list,
              isProcessing: false,
              status: 'uploaded' // Reset status
            };
          }
        }
      });
  }

  startPollingStatus(file: EmailList): void {
    // Cancel existing subscription for this file if exists
    if (this.pollingSubscriptions[file.fileId]) {
      this.pollingSubscriptions[file.fileId].unsubscribe();
    }
    
    // Create a new polling subscription
    this.pollingSubscriptions[file.fileId] = interval(3000)
      .pipe(
        startWith(0), // Immediately call once
        switchMap(() => {
          console.log(`Polling status for file: ${file.fileId}`);
          // If we have a validationId, use that endpoint, otherwise use the fileId endpoint
          if (file.validationId) {
            return this.http.get<ValidationStatus>(`http://localhost:5000/api/emails/status/${file.validationId}`);
          } else {
            return this.http.get<any>(`http://localhost:5000/api/emails/results/${file.fileId}`);
          }
        })
      )
      .subscribe({
        next: (response) => {
           
           console.log('Polling response:', response);
          const index = this.lists.findIndex(item => item.fileId === file.fileId);
          if (index === -1) return;
          
          // Update file status based on response
          if (response.status === 'completed') {
            // If completed, load the full results
            this.http.get<any>(`http://localhost:5000/api/emails/results/${file.fileId}`)
              .subscribe({
                next: (results) => {
                  // Stop polling
                  this.pollingSubscriptions[file.fileId].unsubscribe();
                  delete this.pollingSubscriptions[file.fileId];
                  
                  // Calculate deliverable rate
                  const validEmails = results.validations?.filter(
                    (v: EmailValidation) => v.isValid && v.deliverabilityScore >= 90
                  ).length || 0;
                  
                  const totalEmails = results.validations?.length || 0;
                  const deliverableRate = totalEmails > 0 
                    ? (validEmails / totalEmails) * 100 
                    : 0;
                  
                  // Update file in list
                  this.lists[index] = {
                    ...this.lists[index],
                    status: 'verified',
                    progress: 100,
                    isProcessing: false,
                    emailsReady: totalEmails,
                    deliverableRate: Math.round(deliverableRate),
                    validationResults: results.validations || []
                  };
                }
              });
          } else if (response.status === 'failed') {
            // Stop polling on failure
            this.pollingSubscriptions[file.fileId].unsubscribe();
            delete this.pollingSubscriptions[file.fileId];
            
            this.lists[index] = {
              ...this.lists[index],
              status: 'failed',
              isProcessing: false,
              error: response.error || 'Validation failed'
            };
          } else {
            // Update progress for processing files
            this.lists[index] = {
              ...this.lists[index],
              // Map 'completed' status to 'verified' for consistency
              status: response.status === 'completed' ? 'verified' : response.status,
              progress: response.progress || 0,
              isProcessing: response.status === 'processing' || response.status === 'queued'
            };
          }
        },
        error: (error) => {
          console.error('Error polling status:', error);
          
          // Don't stop polling on error, just log it
          const index = this.lists.findIndex(item => item.fileId === file.fileId);
          if (index !== -1) {
            this.lists[index].error = 'Error checking status';
          }
        }
      });
  }

  viewResults(list: EmailList): void {
    // Prevent default navigation behavior
    event?.preventDefault();
    
    // Navigate programmatically
    this.router.navigate(['email-validation/results', list.fileId], {
      skipLocationChange: false,
      replaceUrl: false
    });
  }

  deleteFile(fileId: string): void {
    if (confirm('Are you sure you want to delete this file?')) {
      // Stop polling if active
      if (this.pollingSubscriptions[fileId]) {
        this.pollingSubscriptions[fileId].unsubscribe();
        delete this.pollingSubscriptions[fileId];
      }
      
      this.http.delete(`http://localhost:5000/api/files/${fileId}`)
        .subscribe({
          next: () => {
            // Remove file from local list
            this.loadFiles();
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
  
  // Helper to format the status display
  getStatusDisplay(file: EmailList): string {
    if (file.status === 'processing') {
      return `Processing (${file.progress || 0}%)`;
    } else if (file.status === 'queued') {
      return 'Queued';
    } else if (file.status === 'failed') {
      return 'Failed';
    } else if (file.status === 'verified' || file.status === 'completed') {
      return 'Verified';
    } else {
      return 'Uploaded';
    }
  }
}