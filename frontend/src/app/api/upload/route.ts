import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export async function POST(request: Request) {
  try {
    const { getToken } = await auth();
    const token = await getToken();
    
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData()
    
    const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { message: data.message || 'Upload failed' },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
} 