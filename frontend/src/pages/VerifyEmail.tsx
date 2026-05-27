import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setUser, setToken, setOrganizations } from '@/store/slices/authSlice';
import { verifyEmail, resendVerification, saveAuth } from '@/services/authService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Loader2, ArrowLeft, RefreshCw, KeyRound, AlertCircle } from 'lucide-react';

const defaultOrgs = [{ id: '1', name: 'Main Organization' }];

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const emailParam = searchParams.get('email') || '';
  const [email] = useState(emailParam);
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Refs for the 6 inputs to manage focus
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Cooldown timer for resending OTP
  useEffect(() => {
    let interval: any;
    if (timer > 0 && !canResend) {
      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer, canResend]);

  // Autofocus the first field on load
  useEffect(() => {
    inputRefs[0].current?.focus();
  }, []);

  // Handle value change for each block
  const handleChange = (index: number, val: string) => {
    // Only accept numeric inputs
    if (val && !/^\d+$/.test(val)) return;

    setError('');
    const newCode = [...code];
    // Keep only the last character (in case user inputs multiple)
    newCode[index] = val.slice(-1);
    setCode(newCode);

    // If input is filled, move focus to the next field
    if (val && index < 5) {
      inputRefs[index + 1].current?.focus();
    }
  };

  // Handle backspaces
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      setError('');
      if (!code[index] && index > 0) {
        // If current field is empty, clear and focus previous field
        const newCode = [...code];
        newCode[index - 1] = '';
        setCode(newCode);
        inputRefs[index - 1].current?.focus();
      } else {
        // Clear current field
        const newCode = [...code];
        newCode[index] = '';
        setCode(newCode);
      }
    }
  };

  // Handle pasting of full code
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim();
    if (!/^\d{6}$/.test(pasteData)) {
      setError('Пожалуйста, вставьте корректный 6-значный цифровой код');
      return;
    }
    setError('');
    const newCode = pasteData.split('');
    setCode(newCode);
    // Focus the last field
    inputRefs[5].current?.focus();
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const otp = code.join('');
    if (otp.length !== 6) {
      setError('Введите все 6 цифр кода подтверждения');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { user, token } = await verifyEmail(email, otp);
      setSuccess('Email успешно подтвержден!');
      
      // Save details to Redux and local storage
      dispatch(setUser(user));
      dispatch(setToken(token));
      dispatch(setOrganizations(defaultOrgs));
      saveAuth(token, user, defaultOrgs);

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка верификации');
      // Highlight inputs with error and focus first
      inputRefs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP code
  const handleResend = async () => {
    if (!canResend) return;
    setResending(true);
    setError('');
    setSuccess('');
    try {
      const { message } = await resendVerification(email);
      setSuccess(message || 'Новый код подтверждения успешно отправлен!');
      setTimer(60);
      setCanResend(false);
      setCode(['', '', '', '', '', '']);
      inputRefs[0].current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка повторной отправки');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Visual Accent Background Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Info helper banner */}
      <div className="w-full max-w-md mb-4 bg-primarySoft border border-primary/20 rounded-xl p-3 flex items-start gap-2.5 shadow-sm transition-all duration-300 hover:border-primary/30">
        <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div>
          <h4 className="text-xs font-semibold text-primary">Информация о доставке</h4>
          <p className="text-xs text-textSecondary mt-0.5 leading-relaxed">
            Если письмо не пришло во входящие в течение минуты, пожалуйста, обязательно проверьте папку <strong className="text-textPrimary font-semibold">«Спам»</strong> или запросите отправку кода повторно.
          </p>
        </div>
      </div>

      <Card className="w-full max-w-md border border-border bg-card shadow-2xl rounded-2xl relative z-10 transition-all duration-300 hover:shadow-primary/5">
        <CardHeader className="pt-8 pb-4 text-center">
          <div className="mx-auto w-12 h-12 bg-primarySoft text-primary rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 hover:scale-110">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-textPrimary tracking-tight">Подтверждение Email</h1>
          <p className="text-sm text-textSecondary mt-1.5 px-4 leading-relaxed">
            Мы отправили 6-значный код подтверждения на <strong className="text-textPrimary font-medium break-all">{email}</strong>
          </p>
        </CardHeader>
        <CardContent className="pb-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500 flex items-start gap-2.5 animate-fadeIn">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-500 flex items-start gap-2.5 animate-fadeIn">
                <div className="h-2 w-2 rounded-full bg-green-500 mt-1.5 animate-ping shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {/* OTP 6-Digit input container */}
            <div className="flex justify-between gap-2.5 max-w-sm mx-auto" onPaste={handlePaste}>
              {code.map((digit, idx) => (
                <input
                  key={idx}
                  ref={inputRefs[idx]}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  disabled={loading}
                  className={`w-12 h-14 text-center text-xl font-semibold rounded-xl border bg-background text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 ${
                    error ? 'border-red-500/40 bg-red-500/[0.02]' : 'border-border hover:border-primary/40'
                  }`}
                  autoComplete="one-time-code"
                />
              ))}
            </div>

            <Button type="submit" className="w-full h-11 text-sm font-medium rounded-xl transition-all duration-300" disabled={loading}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Проверка кода...
                </span>
              ) : (
                'Подтвердить код'
              )}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-border flex flex-col items-center justify-center gap-4 text-sm">
            {canResend ? (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50"
              >
                {resending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Отправить код повторно
              </button>
            ) : (
              <span className="text-textSecondary font-medium flex items-center gap-2">
                Отправить код повторно через <strong className="text-textPrimary font-semibold">{timer} сек</strong>
              </span>
            )}

            <button
              type="button"
              onClick={() => navigate('/login')}
              className="flex items-center gap-1.5 text-textSecondary hover:text-textPrimary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Вернуться на страницу входа
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
