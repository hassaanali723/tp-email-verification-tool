import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  ChevronLeft,
  X,
  Trash2
} from 'lucide-react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/store/file-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function FilesList() {
  const { 
    files, 
    pagination, 
    isLoading, 
    fetchFiles, 
    startVerification,
    deleteFile
  } = useFileStore();

  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleDeleteClick = (fileId: string) => {
    setFileToDelete(fileId);
  };

  const handleDeleteConfirm = async () => {
    if (fileToDelete) {
      await deleteFile(fileToDelete);
      setFileToDelete(null);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      fetchFiles(newPage);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'processing':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'processing':
        return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Your Files</h2>
          <p className="text-sm text-gray-500">
            Showing {files.length} of {pagination.total} files
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchFiles(pagination.page)}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4">
        {files.map((file) => (
          <Card key={file.id} className="group relative p-4">
            {/* Delete Button */}
            <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full bg-white border border-gray-200 shadow-sm hover:bg-red-50 hover:border-red-200 hover:text-red-600 flex items-center justify-center"
                onClick={() => handleDeleteClick(file.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-gray-50 rounded-lg">
                  <FileText className="h-6 w-6 text-gray-500" />
                </div>
                
                <div>
                  <h3 className="font-medium text-gray-900">{file.filename}</h3>
                  <div className="mt-1 flex items-center space-x-3 text-sm text-gray-500">
                    <span>{format(new Date(file.uploadedAt), 'MMM d, yyyy')}</span>
                    <span>•</span>
                    <span>{file.totalEmails} emails</span>
                  </div>

                  {/* Status Badge */}
                  <div className="mt-2 flex items-center space-x-2">
                    <Badge variant="outline" className={getStatusColor(file.status)}>
                      <span className="flex items-center">
                        {getStatusIcon(file.status)}
                        <span className="ml-1.5 capitalize">{file.status}</span>
                      </span>
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                {file.status === 'unverified' && (
                  <Button 
                    onClick={() => startVerification(file.id)}
                    className="bg-[#295c51] hover:bg-[#1e453c]"
                  >
                    Start Verification
                  </Button>
                )}
                {(file.status === 'completed' || file.status === 'processing') && (
                  <Button variant="outline">
                    View Details
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>

            {/* Progress and Stats for completed/processing files */}
            {(file.status === 'completed' || file.status === 'processing') && file.progress && (
              <div className="mt-4 border-t pt-4">
                <div className="grid grid-cols-5 gap-4 items-center">
                  {/* Progress Circle */}
                  <div className="flex flex-col items-center justify-center">
                    <ProgressCircle 
                      value={file.progress.percentage} 
                      size="md"
                      className="mb-2"
                    />
                    <span className="text-xs text-gray-500">
                      {file.progress.processed} of {file.progress.total}
                    </span>
                  </div>

                  {/* Stats Grid */}
                  {file.stats && (
                    <>
                      <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
                        <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                        <div>
                          <div className="text-lg font-semibold text-green-700">
                            {file.stats.deliverable.count}
                          </div>
                          <div className="text-xs text-green-600">Deliverable</div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 p-3 bg-red-50 rounded-lg">
                        <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                        <div>
                          <div className="text-lg font-semibold text-red-700">
                            {file.stats.undeliverable.count}
                          </div>
                          <div className="text-xs text-red-600">Undeliverable</div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 p-3 bg-yellow-50 rounded-lg">
                        <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                        <div>
                          <div className="text-lg font-semibold text-yellow-700">
                            {file.stats.risky.count}
                          </div>
                          <div className="text-xs text-yellow-600">Risky</div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                        <Clock className="h-5 w-5 text-gray-500 flex-shrink-0" />
                        <div>
                          <div className="text-lg font-semibold text-gray-700">
                            {file.stats.unknown.count}
                          </div>
                          <div className="text-xs text-gray-600">Unknown</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold text-gray-800">
              Are you sure?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-600">
              This action cannot be undone. This will permanently delete the file
              and all its validation results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="text-sm font-medium hover:bg-gray-100"
              onClick={() => setFileToDelete(null)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 text-sm font-medium text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pagination Controls */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between border-t pt-4 mt-4">
          <div className="flex items-center gap-1 text-sm text-gray-500">
            Page {pagination.page} of {pagination.pages}
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex gap-1">
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((pageNum) => (
                <Button
                  key={pageNum}
                  variant={pageNum === pagination.page ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePageChange(pageNum)}
                  className={cn(
                    "h-8 w-8 p-0",
                    pageNum === pagination.page && "bg-[#295c51] hover:bg-[#1e453c]"
                  )}
                >
                  {pageNum}
                </Button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.pages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
} 