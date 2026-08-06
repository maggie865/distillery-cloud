import React, { useState } from "react";
import { auth, ALLOWED_GOOGLE_DOMAIN } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";

export default function Login() {
  const { authError } = useAuth();
  const [error, setError] = useState("");

  const handleGoogle = async () => {
    setError("");
    const { error: oauthError } = await auth.signInWithGoogle(`${window.location.origin}/`);
    if (oauthError) setError(oauthError.message);
  };

  const displayError = error || authError?.message;

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle={`Sign in with your @${ALLOWED_GOOGLE_DOMAIN} Google account`}
    >
      {displayError && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {displayError}
        </div>
      )}

      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium"
        onClick={handleGoogle}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>
    </AuthLayout>
  );
}
