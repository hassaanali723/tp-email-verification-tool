import { SignIn } from '@clerk/nextjs';

export default function Page() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#295c51] relative">
      <div className="absolute inset-0" style={{
        opacity: "0.03",
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill-opacity='0.4'/%3E%3C/g%3E%3C/svg%3E")`,
        backgroundSize: "50px 50px"
      }} />
      <div className="w-full max-w-[480px] px-4">
        <SignIn
          appearance={{
            variables: {
              colorPrimary: "#295c51",
              colorTextSecondary: "#295c51",
              colorBackground: "white",
              colorDanger: "#295c51",
              colorSuccess: "#295c51",
              colorWarning: "#295c51",
              colorTextOnPrimaryBackground: "white"
            },
            elements: { 
              footer: "hidden",
              formButtonPrimary: "bg-[#295c51] hover:bg-[#1e453d] text-white",
              card: "shadow-xl rounded-lg",
              headerTitle: "text-[#295c51]",
              headerSubtitle: "text-gray-600",
              socialButtonsBlockButton: "border border-gray-300 hover:bg-gray-50",
              formFieldInput: "border-gray-300 focus:border-[#295c51] focus:ring-[#295c51]",
              dividerLine: "bg-gray-300",
              dividerText: "text-gray-500"
            }
          }}
        />
      </div>
    </div>
  );
}