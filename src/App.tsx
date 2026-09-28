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

type Step = "loading" | "credentials" | "enrollment" | "verification" | "success" | "dashboard" | "admin";

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
  const [isMaster, setIsMaster] = useState(false);
  const [officeSaved, setOfficeSaved] = useState(false);
  const code = useMemo(() => digits.join(""), [digits]);

  useEffect(() => {
    if (window.sessionStorage.getItem("sthander-return-to-login") === "1") {
      window.sessionStorage.removeItem("sthander-return-to-login");
      setStep("credentials");
      return;
    }

    let active = true;
    const fallback = window.setTimeout(() => {
      if (active) setStep("credentials");
    }, 2500);

    async function restoreSession() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (!data.session) {
          setStep("credentials");
          return;
        }
        // A configuração de MFA nunca deve ser iniciada automaticamente ao
        // abrir a página. Ela só acontece depois de um login explícito.
        await supabase.auth.signOut();
        if (active) setStep("credentials");
      } catch {
        if (active) setStep("credentials");
      } finally {
        window.clearTimeout(fallback);
      }
    }

    void restoreSession();
    return () => {
      active = false;
      window.clearTimeout(fallback);
    };
  }, []);

  async function prepareSecondFactor() {
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;
    if (!assurance) throw new Error("Não foi possível validar a sessão da conta.");
    if (assurance?.currentLevel === "aal2") {
      setStep("success");
      return;
    }

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    const verified = factors?.totp?.find((factor) => factor.status === "verified");
    if (verified) {
      setFactorId(verified.id);
      setStep("verification");
      return;
    }

    // Um fator pendente não tem uma confirmação concluída. Recomeçamos a
    // configuração para sempre exibir um QR Code novo e utilizável.
    const pending = factors?.all?.find(
      (factor) => factor.factor_type === "totp" && factor.status === "unverified",
    );
    if (pending) {
      const { error: removalError } = await supabase.auth.mfa.unenroll({ factorId: pending.id });
      if (removalError) throw removalError;
    }

    const { data: enrollment, error: enrollmentError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Google Authenticator",
    });
    if (enrollmentError) throw enrollmentError;
    if (!enrollment?.totp) {
      throw new Error("O autenticador não retornou os dados necessários para a configuração.");
    }
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
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setBusy(false);
      setError("E-mail ou senha inválidos.");
      return;
    }
    if (!signInData.session) {
      setBusy(false);
      setError("Não foi possível criar uma sessão segura. Tente entrar novamente.");
      return;
    }
    setIsMaster(signInData.user.app_metadata?.role === "master");
    try {
      await prepareSecondFactor();
    } catch (reason) {
      console.error("Falha ao preparar a verificação em duas etapas", reason);
      const detail = reason instanceof Error ? reason.message : "";
      setError(detail
        ? `Não foi possível iniciar o Google Authenticator: ${detail}`
        : "Não foi possível preparar a verificação em duas etapas.");
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
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) {
      setBusy(false);
      setError("Não foi possível preparar a confirmação. Atualize a página e tente novamente.");
      return;
    }
    const { error: verificationError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    setBusy(false);
    if (verificationError) {
      setError("Código inválido ou expirado. Aguarde o próximo código e tente novamente.");
      setDigits(initialDigits);
      return;
    }
    setError("");
    setStep("success");
  }

  function reset() {
    // Remove a sessão local antes de recarregar. Assim, uma verificação que
    // ainda esteja em andamento não consegue devolver a pessoa a esta tela.
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith("sb-"))
      .forEach((key) => window.localStorage.removeItem(key));
    window.sessionStorage.setItem("sthander-return-to-login", "1");
    setStep("credentials");
    setDigits(initialDigits);
    setPassword("");
    setError("");
    void supabase.auth.signOut();
    window.setTimeout(() => window.location.reload(), 0);
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

              <button className="admin-login-link" type="button" onClick={() => setError("A área administrativa é liberada automaticamente após o login do usuário master.")}>Área administrativa</button>

              <div className="security-note">
                <ShieldCheck size={18} />
                <p>Nunca solicitaremos sua senha ou código de verificação por telefone ou WhatsApp.</p>
              </div>
            </>
          )}

          {step === "enrollment" && (
            <>
              <button type="button" className="back-button" onClick={reset}><ArrowLeft size={18} /> Sair e voltar ao login</button>
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
              <button type="button" className="back-button" onClick={reset}><ArrowLeft size={18} /> Sair e voltar ao login</button>
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
              <button className="primary-button" type="button" onClick={() => setStep("dashboard")}>Entrar no painel</button>
            </div>
          )}

          {step === "dashboard" && (
            <div className="dashboard">
              <header className="dashboard-header">
                <div><p className="eyebrow">Sthander Jurídico</p><h2>Painel do escritório</h2><p>Visão geral segura para a operação jurídica.</p></div>
                <button className="text-button" type="button" onClick={reset}>Sair da conta</button>
              </header>
              <nav className="dashboard-nav" aria-label="Módulos do sistema">
                <button type="button">Visão geral</button><button type="button">Clientes</button><button type="button">Processos</button><button type="button">Equipe jurídica</button><button type="button">Agenda</button><button type="button">Financeiro</button><button type="button">Documentos</button>{isMaster && <button type="button" onClick={() => setStep("admin")}>Administrar escritórios</button>}
              </nav>
              <div className="dashboard-notice"><ShieldCheck size={18} /> Ambiente de estrutura inicial. Cadastros reais serão habilitados após as permissões por escritório e proteção de dados.</div>
              <div className="dashboard-grid">
                <article><span>Clientes</span><strong>0</strong><p>Cadastros, contatos, documentos e histórico de atendimento.</p></article>
                <article><span>Processos</span><strong>0</strong><p>Instância, número, partes, prazos, movimentações e peças.</p></article>
                <article><span>Prazos próximos</span><strong>0</strong><p>Agenda processual, tarefas, audiências e lembretes.</p></article>
                <article><span>Recebimentos</span><strong>R$ 0,00</strong><p>Honorários, contratos, parcelas, despesas e inadimplência.</p></article>
              </div>
              <section className="dashboard-section"><h3>Equipe jurídica</h3><div className="feature-columns"><ul><li>Cadastro de advogados: nome, CPF, OAB/UF, contato e áreas de atuação</li><li>Status ativo e disponibilidade para distribuição automática</li><li>Advogado responsável e corresponsáveis por processo</li></ul><ul><li>Distribuição manual pelo gerente ou automática por área e carga</li><li>Histórico de atribuição e transferência de responsáveis</li><li>Permissões para advogado, assistente, financeiro e gestor</li></ul></div><button className="primary-button" type="button" disabled>Cadastrar advogado — será habilitado junto ao banco</button></section>
            </div>
          )}

          {step === "admin" && isMaster && (
            <div className="dashboard">
              <header className="dashboard-header"><div><p className="eyebrow">Acesso master</p><h2>Administração da plataforma</h2><p>Controle de escritórios, assinaturas e cobrança.</p></div><button className="text-button" type="button" onClick={() => setStep("dashboard")}>Voltar ao painel</button></header>
              <div className="dashboard-grid"><article><span>Escritórios ativos</span><strong>0</strong><p>Cadastre e ative novos escritórios.</p></article><article><span>Pagamentos a vencer</span><strong>0</strong><p>Avisos automáticos antes do vencimento.</p></article><article><span>Em atraso</span><strong>0</strong><p>Controle de bloqueio e regularização.</p></article><article><span>Receita mensal</span><strong>R$ 0,00</strong><p>Indicadores por plano e período.</p></article></div>
              <section className="dashboard-section"><h3>Cadastrar escritório</h3><form className="office-form" onSubmit={(event) => { event.preventDefault(); setOfficeSaved(true); }}><input required placeholder="Razão social ou nome do escritório" /><input placeholder="CNPJ" /><input required placeholder="Nome do advogado responsável" /><input placeholder="OAB / UF" /><input required type="email" placeholder="E-mail de contato" /><input placeholder="Telefone / WhatsApp" /><select defaultValue=""><option value="" disabled>Plano contratado</option><option>Essencial</option><option>Profissional</option><option>Corporativo</option></select><input required type="number" min="0" step="0.01" placeholder="Valor mensal (R$)" /><input required type="number" min="1" max="28" placeholder="Dia de vencimento" /><select defaultValue="trial"><option value="trial">Em teste</option><option value="active">Ativo</option><option value="suspended">Suspenso</option></select><button className="primary-button" type="submit">Salvar escritório</button></form>{officeSaved && <p className="success-inline">Cadastro preparado. A gravação permanente será habilitada após a conexão final do banco ao painel.</p>}</section>
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
