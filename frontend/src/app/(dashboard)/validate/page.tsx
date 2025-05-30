'use client'

import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import FilesList from '@/components/files/FilesList'
import { useAuthenticatedFileStore } from '@/hooks/useAuthenticatedFileStore'
import { useAuth } from '@clerk/nextjs'

interface FileStatus {
  progress: number
  status: 'uploading' | 'error' | 'success'
  message?: string
  fileId?: string
}

export default function ValidatePage() {
  const [fileStatus, setFileStatus] = useState<FileStatus | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const router = useRouter()
  const { uploadSuccess } = useAuthenticatedFileStore()
  const { getToken } = useAuth()

  const onDrop = useCallback(async (acceptedFiles: File[]) => {

    const file = acceptedFiles[0]
    if (!file) return

    // Validate file type
    const allowedTypes = [
      '.csv',
      '.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ]
    
    const isValidType = allowedTypes.some(type => 
      file.name.toLowerCase().endsWith(type) || file.type === type
    )

    if (!isValidType) {
      toast.error('Please upload a CSV or XLSX file')
      return
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB')
      return
    }

    setFileStatus({ progress: 0, status: 'uploading' })

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        const errorMessage = data?.message || 'Upload failed. Please try again.'
        throw new Error(errorMessage)
      }
      
      if (data.success && data.data.fileId) {
        setFileStatus({ 
          progress: 100, 
          status: 'success', 
          message: 'File uploaded successfully!', 
          fileId: data.data.fileId 
        })
        
        // Call uploadSuccess to refresh the file list
        await uploadSuccess()

        // Clear status after a delay
        setTimeout(() => {
          setFileStatus(null)
        }, 3000)
      } else {
        throw new Error('Invalid response format')
      }
    } catch (error) {
      console.error('Upload error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Upload failed. Please try again.'
      setFileStatus({ progress: 0, status: 'error', message: errorMessage })
      toast.error(errorMessage)
    }
  }, [uploadSuccess, getToken])

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    multiple: false,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
    onDropAccepted: () => setIsDragging(false),
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    }
  })

  return (
    <div className="container mx-auto py-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-800">Email Validation</h1>
        <p className="text-sm text-gray-500">
          Upload your CSV file containing email addresses for validation.
        </p>
      </div>

      {/* Upload and Guidelines side by side */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Upload Zone */}
        <Card>
          <CardContent className="pt-4">
            <div
              {...getRootProps()}
              className={`
                relative border-2 border-dashed rounded-lg p-6
                transition-colors duration-200 ease-in-out
                ${isDragging 
                  ? 'border-[#295c51] bg-[#295c51]/5' 
                  : 'border-gray-200 hover:border-[#295c51] hover:bg-gray-50'
                }
              `}
            >
              <input {...getInputProps()} />
              
              <div className="flex flex-col items-center justify-center space-y-3 text-center">
                <div className="p-2 bg-[#295c51] rounded-full text-white">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-base font-medium text-gray-800">
                    Drag and drop your file here
                  </p>
                  <p className="text-sm text-gray-500">
                    or click to browse from your computer
                  </p>
                </div>
                <div className="text-xs text-gray-400">
                  Maximum file size: 10MB • Format: CSV, XLSX
                </div>
              </div>
            </div>

            {/* Upload Status */}
            {fileStatus && (
              <div className={`
                mt-3 p-3 rounded-lg flex items-center justify-between
                ${fileStatus.status === 'error' ? 'bg-red-50' : 'bg-white'}
                border ${fileStatus.status === 'error' ? 'border-red-100' : 'border-gray-100'}
              `}>
                <div className="flex items-center space-x-3">
                  {fileStatus.status === 'uploading' && (
                    <Loader2 className="h-4 w-4 text-[#295c51] animate-spin" />
                  )}
                  {fileStatus.status === 'error' && (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  {fileStatus.status === 'success' && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  <span className={`text-sm ${
                    fileStatus.status === 'error' ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {fileStatus.message || 'Uploading...'}
                  </span>
                </div>
                
                {fileStatus.status === 'uploading' && (
                  <Progress value={fileStatus.progress} className="w-24" />
                )}
                
                {(fileStatus.status === 'error' || fileStatus.status === 'success') && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFileStatus(null)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Guidelines */}
        <Card>
          <CardContent className="pt-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-2">Guidelines</h2>
            <ul className="space-y-1.5">
              <li className="flex items-center text-xs text-gray-600">
                <div className="w-1.5 h-1.5 bg-[#295c51] rounded-full mr-2" />
                Your CSV file should have an 'email' column containing the email addresses
              </li>
              <li className="flex items-center text-xs text-gray-600">
                <div className="w-1.5 h-1.5 bg-[#295c51] rounded-full mr-2" />
                Each email will be validated for syntax, domain, and mailbox existence
              </li>
              <li className="flex items-center text-xs text-gray-600">
                <div className="w-1.5 h-1.5 bg-[#295c51] rounded-full mr-2" />
                The validation process may take a few minutes depending on the file size
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Files List Section */}
      <div className="space-y-4">
        <FilesList />
      </div>
    </div>
  )
} 