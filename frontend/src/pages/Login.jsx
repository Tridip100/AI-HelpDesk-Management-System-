import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (u, p) => {
    setError("");
    setLoading(true);

    try {
      await login(u, p);

      if (remember) {
        localStorage.setItem("rememberUser", u);
      }

      navigate("/");
    } catch {
      setError("Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .fade-up {
          animation: fadeUp 0.5s ease-out;
        }
      `}</style>

      <div className="flex h-screen bg-white overflow-hidden">
        {/* LEFT PANEL */}
        <div className="w-[28%] min-w-[300px] bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 p-10 flex flex-col justify-between text-white">
          <div>
            {/* Logo */}
            <div className="flex items-center gap-4 mb-14">
              <div className="h-14 w-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-xl font-bold">
                AI
              </div>

              <div>
                <h1 className="text-2xl font-bold">
                  HelpDesk AI
                </h1>

                <p className="text-indigo-200 text-sm">
                  Intelligent Support Platform
                </p>
              </div>
            </div>

            {/* Hero Content */}
            <h2 className="text-4xl font-bold leading-tight mb-6">
              Smarter IT Support.
              <br />
              Faster Resolution.
            </h2>

            <p className="text-base text-indigo-100 leading-relaxed mb-10">
              Streamline ticket management, automate support
              workflows, and empower your teams with AI-driven
              assistance and real-time collaboration.
            </p>

            {/* Feature Cards */}
            <div className="space-y-4">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
                <h3 className="font-semibold mb-2">
                  AI-Powered Assistance
                </h3>

                <p className="text-sm text-indigo-100">
                  Generate intelligent solutions and troubleshooting
                  recommendations instantly.
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
                <h3 className="font-semibold mb-2">
                  Smart Ticket Management
                </h3>

                <p className="text-sm text-indigo-100">
                  Assign, prioritize and track tickets with
                  complete visibility.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-white/10 pt-6">
            <p className="text-sm text-indigo-200">
              AI-powered IT Service Management Platform
            </p>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 flex items-center justify-center bg-slate-50 px-8">
          <div className="w-full max-w-2xl fade-up">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-14 lg:p-16">
              {/* Header */}
              <div className="text-center mb-10">
                <h2 className="text-4xl font-bold text-slate-900 mb-3">
                  Welcome Back
                </h2>

                <p className="text-slate-500 text-lg">
                  Sign in to access your HelpDesk workspace
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* Username */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Username
                </label>

                <input
                  type="text"
                  value={username}
                  placeholder="Enter your username"
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    handleLogin(username, password)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                />
              </div>

              {/* Password */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Password
                </label>

                <input
                  type="password"
                  value={password}
                  placeholder="Enter your password"
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    handleLogin(username, password)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                />
              </div>

              {/* Remember Me + Forgot Password */}
              <div className="flex items-center justify-between mb-8">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={() => setRemember(!remember)}
                    className="rounded"
                  />
                  Remember me
                </label>

                <button
                  type="button"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Login Button */}
              <button
                onClick={() => handleLogin(username, password)}
                disabled={loading || !username.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Signing In..." : "Sign In"}
              </button>

              {/* Footer Text */}
              <div className="mt-8 text-center">
                <p className="text-sm text-slate-500">
                  Secure access to your AI-powered support platform
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}