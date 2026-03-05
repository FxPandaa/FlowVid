import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../stores";
import { Play } from "../components/Icons";
import "./LoginPage.css";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register, isLoading, error, clearError } = useAuthStore();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (isSignUp) {
      if (password !== confirmPassword) {
        setLocalError("Passwords do not match");
        return;
      }
      if (password.length < 8) {
        setLocalError("Password must be at least 8 characters");
        return;
      }

      try {
        await register(email, username, password);
        navigate("/");
      } catch (err) {
        // Error is handled by the store
      }
    } else {
      try {
        await login(email, password);
        navigate("/");
      } catch (err) {
        // Error is handled by the store
      }
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setLocalError(null);
    clearError();
  };

  return (
    <div className="login-page">
      <div className="login-background"></div>

      <div className="login-container">
        <Link to="/" className="login-logo">
          <span className="logo-icon">
            <Play size={18} />
          </span>
          <span className="logo-text">FlowVid</span>
        </Link>

        <div className="login-form-container">
          <h1>{isSignUp ? "Create Account" : "Sign In"}</h1>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <input
                type="email"
                className="input"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {isSignUp && (
              <div className="form-group">
                <input
                  type="text"
                  className="input"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={2}
                  maxLength={32}
                />
              </div>
            )}

            <div className="form-group">
              <input
                type="password"
                className="input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {isSignUp && (
              <div className="form-group">
                <input
                  type="password"
                  className="input"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            )}

            {(error || localError) && (
              <div className="form-error">{localError || error}</div>
            )}

            <button
              type="submit"
              className="btn btn-primary login-submit-btn"
              disabled={isLoading}
            >
              {isLoading
                ? "Please wait..."
                : isSignUp
                  ? "Create Account"
                  : "Sign In"}
            </button>
          </form>

          <p className="login-toggle">
            {isSignUp ? (
              <>
                Already have an account?{" "}
                <button type="button" onClick={toggleMode}>
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{" "}
                <button type="button" onClick={toggleMode}>
                  Sign up
                </button>
              </>
            )}
          </p>

          <div className="login-divider">
            <span>or</span>
          </div>

          <Link to="/" className="btn btn-ghost continue-btn">
            Continue without account
          </Link>

          <p className="login-note">
            An account lets you sync your library and watch history across
            devices.
          </p>
        </div>
      </div>
    </div>
  );
}
