import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  FileLock2,
  KeyRound,
  LockKeyhole,
  Scale,
  ShieldCheck
} from "lucide-react";
import { supabase } from "./supabase";

type Step = "loading" | "credentials" | "enrollment" | "verification" | "success";

const initialDigits = ["", "", "", "", "", ""];

export function App() {
  const [step, setStep] = useState<Step>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [digits, setDigits] = useState(initialDigits);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const code = useMemo(() => digits.join(""), [digits]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setStep("credentials");
        return;
      }
      setEmail(data.session.user.email ?? "");
      await prepareSecondFactor();
    });
  }, []);

  async function prepareSecondFactor() {
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance?.currentLevel === "aal2") {
      setStep("success");
      return;
    }

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    const verified = factors.totp.find((factor) => factor.status === "verified");
    if (verified) {
      setFactorId(verified.id);
      setStep("verification");
      return;
    }

    const { data: enrollment, error: enrollmentError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Google Authenticator",
    });
    if (enrollmentError) throw enrollmentError;
    setFactorId(enrollment.id);
    setQrCode(enrollment.totp.qr_code);
    setTotpSecret(enrollment.totp.secret);
    setStep("enrollment");
  }

  async function submitCredentials(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Informe seu usuário ou e-mail e sua senha para continuar.");
      return;
    }
    if (!email.includes("@")) {
      setError("Informe seu e-mail profissional completo.");
      return;
    }
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setBusy(false);
      setError("E-mail ou senha inválidos.");
      return;
    }
    try {
      await prepareSecondFactor();
    } catch {
      setError("Não foi possível preparar a verificação em duas etapas.");
    } finally {
      setBusy(false);
    }
  }

  function updateDigit(index: number, value: string) {
    const sanitized = value.replace(/\D/g, "").slice(-1);
    setDigits((current) => current.map((digit, position) => position === index ? sanitized : digit));
    setError("");
    if (sanitized && index < 5) {
      document.getElementById(`digit-${index + 1}`)?.focus();
    }
  }

  async function submitVerification(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) {
      setError("Digite os seis números do código de verificação.");
      return;
    }
    setBusy(true);
    const { error: verificationError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (verificationError) {
      setError("Código inválido ou expirado. Aguarde o próximo código e tente novamente.");
      setDigits(initialDigits);
      return;
    }
    setError("");
    setStep("success");
  }

  async function reset() {
    await supabase.auth.signOut();
    setStep("credentials");
    setDigits(initialDigits);
    setPassword("");
    setError("");
  }

  return (
    <main className="page-shell">
      <section className="brand-panel" aria-label="Apresentação do Sthander Jurídico">
        <div className="brand-top">
          <div className="brand-mark" aria-hidden="true"><Scale size={25} strokeWidth={1.8} /></div>
          <div>
            <strong>Sthander</strong>
            <span>Jurídico</span>
          </div>
        </div>

        <div className="brand-message">
          <p className="eyebrow">Gestão jurídica segura</p>
          <h1>Seu escritório organizado, protegido e sempre atualizado.</h1>
          <p className="lead">
            Clientes, documentos e processos em um único ambiente, com rastreabilidade e privacidade desde o primeiro acesso.
          </p>
          <div className="trust-list">
            <div><ShieldCheck size={21} /><span>Autenticação em duas etapas</span></div>
            <div><FileLock2 size={21} /><span>Documentos privados e protegidos</span></div>
            <div><Check size={21} /><span>Histórico completo de acessos</span></div>
          </div>
        </div>

        <p className="brand-footer">Ambiente exclusivo para usuários autorizados.</p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="development-banner" role="status">
            Ambiente de desenvolvimento — não utilize dados reais nesta versão.
          </div>
          {step === "loading" && <p className="loading-state">Verificando acesso seguro...</p>}
          {step === "credentials" && (
            <>
              <div className="mobile-brand">
                <div className="brand-mark"><Scale size={22} /></div>
                <strong>Sthander <span>Jurídico</span></strong>
              </div>
              <div className="card-heading">
                <span className="icon-box"><LockKeyhole size={22} /></span>
                <p className="eyebrow">Acesso seguro</p>
                <h2>Bem-vindo de volta</h2>
                <p>Entre com os dados fornecidos pelo administrador do seu escritório.</p>
              </div>

              <form onSubmit={submitCredentials} noValidate>
                <label htmlFor="email">E-mail profissional</label>
                <input
                  id="email"
                  type="text"
                  autoComplete="username"
                  placeholder="voce@escritorio.com.br"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-describedby={error ? "form-error" : undefined}
                />

                <div className="password-label">
                  <label htmlFor="password">Senha</label>
                  <button type="button" className="text-button">Esqueci minha senha</button>
                </div>
                <div className="password-field">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-describedby={error ? "form-error" : undefined}
                  />
                  <button
                    type="button"
                    className="show-password"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>

                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(event) => setRememberDevice(event.target.checked)}
                  />
                  <span>Confiar neste dispositivo por 7 dias</span>
                </label>

                {error && <p className="error-message" id="form-error" role="alert">{error}</p>}
                <button className="primary-button" type="submit" disabled={busy}>{busy ? "Verificando..." : "Entrar com segurança"}</button>
              </form>

              <div className="security-note">
                <ShieldCheck size={18} />
                <p>Nunca solicitaremos sua senha ou código de verificação por telefone ou WhatsApp.</p>
              </div>
            </>
          )}

          {step === "enrollment" && (
            <>
              <button type="button" className="back-button" onClick={reset}><ArrowLeft size={18} /> Sair</button>
              <div className="card-heading verification-heading">
                <span className="icon-box"><KeyRound size={22} /></span>
                <p className="eyebrow">Proteção da conta</p>
                <h2>Configure o Google Authenticator</h2>
                <p>Abra o aplicativo, toque em adicionar e escaneie o QR Code abaixo.</p>
                <span className="account-chip">{email}</span>
              </div>
              <div className="qr-panel">
                <img src={qrCode} alt="QR Code para configurar o Google Authenticator" />
                <details>
                  <summary>Não consigo escanear o QR Code</summary>
                  <code>{totpSecret}</code>
                </details>
              </div>
              <button className="primary-button full-width" type="button" onClick={() => { setDigits(initialDigits); setStep("verification"); }}>
                Já escaneei o código
              </button>
              <div className="security-note">
                <ShieldCheck size={18} />
                <p>O QR Code e a chave são exclusivos da sua conta. Não tire foto nem compartilhe.</p>
              </div>
            </>
          )}

          {step === "verification" && (
            <>
              <button type="button" className="back-button" onClick={reset}><ArrowLeft size={18} /> Voltar</button>
              <div className="card-heading verification-heading">
                <span className="icon-box"><KeyRound size={22} /></span>
                <p className="eyebrow">Segunda etapa</p>
                <h2>Confirme que é você</h2>
                <p>Digite o código exibido no Google Authenticator.</p>
                <span className="account-chip">{email}</span>
              </div>
              <form onSubmit={submitVerification}>
                <div className="code-inputs" aria-label="Código de verificação">
                  {digits.map((digit, index) => (
                    <input
                      key={index}
                      id={`digit-${index}`}
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      maxLength={1}
                      value={digit}
                      onChange={(event) => updateDigit(index, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Backspace" && !digit && index > 0) {
                          document.getElementById(`digit-${index - 1}`)?.focus();
                        }
                      }}
                      aria-label={`Dígito ${index + 1}`}
                    />
                  ))}
                </div>
                {error && <p className="error-message" role="alert">{error}</p>}
                <button className="primary-button" type="submit" disabled={busy}>{busy ? "Verificando..." : "Verificar e acessar"}</button>
              </form>
              <div className="security-note">
                <ShieldCheck size={18} />
                <p>O código expira rapidamente e só pode ser usado uma vez.</p>
              </div>
            </>
          )}

          {step === "success" && (
            <div className="success-state">
              <span className="success-icon"><ShieldCheck size={34} /></span>
              <p className="eyebrow">Identidade confirmada</p>
              <h2>Acesso autorizado</h2>
              <p>Login e verificação em duas etapas concluídos com segurança.</p>
              <button className="primary-button" type="button" onClick={reset}>Sair da conta</button>
            </div>
          )}

          <p className="legal-line">
            Ao entrar, você concorda com os termos de uso e a política de privacidade.
          </p>
        </div>
      </section>
    </main>
  );
}
