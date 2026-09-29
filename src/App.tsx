import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  FileLock2,
  KeyRound,
  LockKeyhole,
  Pencil,
  Scale,
  ShieldCheck
} from "lucide-react";
import { supabase } from "./supabase";

type Step = "loading" | "credentials" | "enrollment" | "verification" | "success" | "dashboard" | "admin";
type OfficeSummary = {
  id: string;
  legal_name: string;
  cnpj: string | null;
  responsible_name: string | null;
  oab_responsible: string | null;
  contact_email: string;
  contact_phone: string | null;
  status: string;
  created_at: string;
  plan_name: string;
  amount: number;
  due_day: number;
};

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
  const [officeBusy, setOfficeBusy] = useState(false);
  const [officeLoading, setOfficeLoading] = useState(false);
  const [offices, setOffices] = useState<OfficeSummary[]>([]);
  const [editingOffice, setEditingOffice] = useState<OfficeSummary | null>(null);
  const [officeError, setOfficeError] = useState("");
  const code = useMemo(() => digits.join(""), [digits]);

  async function loadOffices() {
    setOfficeLoading(true);
    setOfficeError("");
    try {
      const { data, error: loadError } = await supabase
        .from("offices")
        .select("id, legal_name, cnpj, responsible_name, oab_responsible, contact_email, contact_phone, status, created_at")
        .order("created_at", { ascending: false });
      if (loadError) {
        setOfficeError("Não foi possível carregar os escritórios. Tente atualizar a lista.");
        return;
      }

      const officeRows = data ?? [];
      if (officeRows.length === 0) {
        setOffices([]);
        return;
      }

      const officeIds = officeRows.map((office) => office.id);
      const { data: subscriptions, error: subscriptionError } = await supabase
        .from("subscriptions")
        .select("office_id, plan_id, amount, due_day")
        .in("office_id", officeIds);
      if (subscriptionError) {
        setOfficeError("Não foi possível carregar as assinaturas vinculadas aos escritórios.");
        return;
      }

      const planIds = [...new Set((subscriptions ?? []).map((subscription) => subscription.plan_id).filter(Boolean))];
      const { data: plans, error: planError } = planIds.length
        ? await supabase.from("plans").select("id, name").in("id", planIds)
        : { data: [], error: null };
      if (planError) {
        setOfficeError("Não foi possível carregar os planos dos escritórios.");
        return;
      }

      const subscriptionsByOffice = new Map((subscriptions ?? []).map((subscription) => [subscription.office_id, subscription]));
      const planNames = new Map((plans ?? []).map((plan) => [plan.id, plan.name]));
      setOffices(officeRows.map((office) => {
        const subscription = subscriptionsByOffice.get(office.id);
        return {
          ...office,
          plan_name: subscription ? planNames.get(subscription.plan_id) ?? "" : "",
          amount: Number(subscription?.amount ?? 0),
          due_day: Number(subscription?.due_day ?? 1),
        } as OfficeSummary;
      }));
    } catch {
      setOfficeError("Não foi possível conectar ao banco. Confira sua conexão e tente novamente.");
    } finally {
      setOfficeLoading(false);
    }
  }

  async function saveOffice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOfficeSaved(false);
    setOfficeError("");
    setError("");
    setOfficeBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const oabNumber = String(form.get("oab_number") ?? "").trim();
    const oabState = String(form.get("oab_state") ?? "").trim().toUpperCase();
    try {
      const officeFields = {
        p_legal_name: String(form.get("legal_name") ?? "").trim(),
        p_cnpj: String(form.get("cnpj") ?? "").replace(/\D/g, "") || null,
        p_responsible_name: String(form.get("responsible_name") ?? "").trim(),
        p_oab_responsible: oabNumber ? `${oabNumber}/${oabState}` : null,
        p_contact_email: String(form.get("email") ?? "").trim(),
        p_contact_phone: String(form.get("phone") ?? "").trim() || null,
        p_plan_name: String(form.get("plan") ?? ""),
        p_amount: Number(form.get("amount")),
        p_due_day: Number(form.get("due_day")),
        p_status: String(form.get("status") ?? "trial"),
      };
      const { error: saveError } = editingOffice
        ? await supabase.rpc("update_office_with_subscription", { p_office_id: editingOffice.id, ...officeFields })
        : await supabase.rpc("create_office_with_subscription", officeFields);
      if (saveError) {
        console.error("Falha ao salvar escritório", saveError);
        setOfficeError(saveError.message.includes("office_with_subscription")
          ? "O banco ainda precisa receber a atualização dos cadastros. Nenhum dado foi salvo."
          : "Não foi possível salvar. Confira os dados e tente novamente.");
        return;
      }
      formElement.reset();
      setEditingOffice(null);
      setOfficeSaved(true);
      await loadOffices();
    } catch {
      setOfficeError("Não foi possível conectar ao banco. Os dados não foram confirmados como salvos.");
    } finally {
      setOfficeBusy(false);
    }
  }

  function beginOfficeEdit(office: OfficeSummary) {
    setEditingOffice(office);
    setOfficeSaved(false);
    setOfficeError("");
  }

  useEffect(() => {
    if (step === "admin" && isMaster) void loadOffices();
  }, [step, isMaster]);

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
              <section className="dashboard-section"><h3>Equipe jurídica deste escritório</h3><p className="team-intro">O cadastro da equipe ficará vinculado a este escritório. Será possível incluir vários advogados, associados e cooperadores, cada um com seu próprio acesso.</p><div className="feature-columns"><ul><li>Dados profissionais, OAB/UF, contato e áreas de atuação</li><li>Tipo de vínculo e status de cada integrante</li><li>Advogado responsável e corresponsáveis por processo</li></ul><ul><li>Distribuição manual ou por área e carga de trabalho</li><li>Histórico de atribuições e transferências</li><li>Permissões conforme a função de cada pessoa</li></ul></div><button className="primary-button" type="button" disabled>Cadastro de equipe — em preparação</button></section>
            </div>
          )}

          {step === "admin" && isMaster && (
            <div className="dashboard admin-dashboard">
              <header className="dashboard-header">
                <div><p className="eyebrow">Área master</p><h2>Escritórios</h2><p>Cadastre e acompanhe os escritórios atendidos pela plataforma.</p></div>
                <button className="text-button" type="button" onClick={() => setStep("dashboard")}>Voltar ao painel</button>
              </header>

              <div className="admin-summary" aria-label="Resumo de escritórios">
                <article><span>Total de escritórios</span><strong>{offices.length}</strong><p>Cadastros registrados</p></article>
                <article><span>Ativos</span><strong>{offices.filter((office) => office.status === "active").length}</strong><p>Com acesso liberado</p></article>
                <article><span>Em teste</span><strong>{offices.filter((office) => office.status === "trial").length}</strong><p>Período de avaliação</p></article>
              </div>

              <section className="dashboard-section office-editor">
                <div className="section-heading"><div><p className="eyebrow">{editingOffice ? "Editar cadastro" : "Novo cadastro"}</p><h3>{editingOffice ? editingOffice.legal_name : "Dados do escritório"}</h3><p>As informações básicas e a assinatura ficam vinculadas ao mesmo cadastro.</p></div></div>
                <form className="office-form" key={editingOffice?.id ?? "new-office"} onSubmit={saveOffice}>
                  <fieldset>
                    <legend>Identificação</legend>
                    <label>Razão social ou nome do escritório<input name="legal_name" autoComplete="organization" required placeholder="Ex.: Silva & Machado Advocacia" defaultValue={editingOffice?.legal_name ?? ""} /></label>
                    <label>CNPJ <span className="optional-label">Opcional</span><input name="cnpj" inputMode="numeric" autoComplete="off" placeholder="00.000.000/0000-00" defaultValue={editingOffice?.cnpj ?? ""} /></label>
                    <label>Advogado responsável<input name="responsible_name" required autoComplete="name" placeholder="Nome completo" defaultValue={editingOffice?.responsible_name ?? ""} /></label>
                    <div className="field-group"><label>Número da OAB<input name="oab_number" placeholder="Ex.: 123456" defaultValue={editingOffice?.oab_responsible?.split("/")[0] ?? ""} /></label><label>UF<select name="oab_state" defaultValue={editingOffice?.oab_responsible?.split("/")[1] ?? "RJ"}><option>AC</option><option>AL</option><option>AP</option><option>AM</option><option>BA</option><option>CE</option><option>DF</option><option>ES</option><option>GO</option><option>MA</option><option>MT</option><option>MS</option><option>MG</option><option>PA</option><option>PB</option><option>PR</option><option>PE</option><option>PI</option><option>RJ</option><option>RN</option><option>RS</option><option>RO</option><option>RR</option><option>SC</option><option>SP</option><option>SE</option><option>TO</option></select></label></div>
                  </fieldset>
                  <fieldset>
                    <legend>Contato</legend>
                    <label>E-mail de contato<input name="email" required type="email" autoComplete="email" placeholder="contato@escritorio.com.br" defaultValue={editingOffice?.contact_email ?? ""} /></label>
                    <label>Telefone ou WhatsApp<input name="phone" type="tel" autoComplete="tel" placeholder="(00) 00000-0000" defaultValue={editingOffice?.contact_phone ?? ""} /></label>
                  </fieldset>
                  <fieldset>
                    <legend>Assinatura</legend>
                    <label>Plano<select name="plan" required defaultValue={editingOffice?.plan_name ?? ""}><option value="" disabled>Selecione um plano</option><option value="Essencial">Essencial</option><option value="Profissional">Profissional</option><option value="Corporativo">Corporativo</option></select></label>
                    <label>Mensalidade<input name="amount" required type="number" min="0" step="0.01" inputMode="decimal" placeholder="R$ 0,00" defaultValue={editingOffice?.amount ?? ""} /></label>
                    <label>Dia de vencimento<input name="due_day" required type="number" min="1" max="28" placeholder="1 a 28" defaultValue={editingOffice?.due_day ?? ""} /><small>Escolha um dia entre 1 e 28.</small></label>
                    <label>Situação<select name="status" defaultValue={editingOffice?.status ?? "trial"}><option value="trial">Em teste</option><option value="active">Ativo</option><option value="overdue">Em atraso</option><option value="suspended">Suspenso</option><option value="cancelled">Cancelado</option></select></label>
                  </fieldset>
                  {officeError && <p className="error-message form-feedback" role="alert">{officeError}</p>}
                  {officeSaved && <p className="success-inline form-feedback" role="status">Cadastro do escritório e assinatura salvos.</p>}
                  <div className="form-actions"><p>Os dados só serão gravados após a confirmação do banco.</p><div className="form-action-buttons">{editingOffice && <button className="secondary-button" type="button" onClick={() => setEditingOffice(null)}>Cancelar edição</button>}<button className="primary-button" type="submit" disabled={officeBusy}>{officeBusy ? "Salvando…" : editingOffice ? "Salvar alterações" : "Salvar escritório"}</button></div></div>
                </form>
              </section>

              <section className="dashboard-section office-list-section">
                <div className="section-heading"><div><p className="eyebrow">Cadastros</p><h3>Escritórios cadastrados</h3></div><button className="secondary-button refresh-button" type="button" onClick={() => void loadOffices()} disabled={officeLoading}>{officeLoading ? "Atualizando…" : "Atualizar lista"}</button></div>
                {officeError && !officeSaved && <p className="error-message" role="alert">{officeError}</p>}
                {officeLoading ? <p className="empty-state">Carregando escritórios…</p> : offices.length === 0 ? <p className="empty-state">Nenhum escritório cadastrado ainda.</p> : (
                  <div className="office-table-wrap"><table className="office-table"><thead><tr><th>Escritório</th><th>CNPJ</th><th>Contato</th><th>Situação</th><th>Cadastro</th><th>Ações</th></tr></thead><tbody>{offices.map((office) => <tr key={office.id}><td>{office.legal_name}</td><td>{office.cnpj || "—"}</td><td>{office.contact_email}</td><td><span className={`status-pill status-${office.status}`}>{office.status === "active" ? "Ativo" : office.status === "trial" ? "Em teste" : office.status}</span></td><td>{new Date(office.created_at).toLocaleDateString("pt-BR")}</td><td><button className="office-edit-button" type="button" onClick={() => beginOfficeEdit(office)} aria-label={`Editar ${office.legal_name}`}><Pencil size={15} aria-hidden="true" />Editar</button></td></tr>)}</tbody></table></div>
                )}
              </section>

              <section className="dashboard-section next-step-card"><div><p className="eyebrow">Próxima etapa</p><h3>Equipe e acessos</h3><p>Depois de cadastrar um escritório, a equipe será gerenciada dentro dele. Um escritório poderá ter vários advogados, associados e cooperadores, com convites e permissões individuais.</p></div><button className="secondary-button" type="button" disabled>Em preparação</button></section>
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
