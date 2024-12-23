import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-email-validation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './email-validation.component.html',
  // Remove the line below if the CSS file doesn't exist
  styleUrls: ['./email-validation.component.scss'],
})
export class EmailValidationComponent {
  selectedFile: File | null = null;
  emailColumn: string = '';
  validationResults: any[] = [];

  constructor(private http: HttpClient) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedFile = input.files[0];
    }
  }

  uploadFile(): void {
    if (!this.selectedFile || !this.emailColumn) return;

    const formData = new FormData();
    formData.append('file', this.selectedFile);

    // File upload API call
    this.http.post<any>('http://localhost:5000/api/files/upload', formData).subscribe(
      (uploadResponse) => {
        const fileId = uploadResponse.fileId;

        // File processing API call
        const processPayload = { fileId, emailColumn: this.emailColumn };
        this.http.post<any>('http://localhost:5000/api/emails/process-file', processPayload).subscribe(
          (processResponse) => {
            this.validationResults = processResponse.savedDocument.validations;
          },
          (error) => console.error('Error processing file:', error)
        );
      },
      (error) => console.error('Error uploading file:', error)
    );
  }
}
