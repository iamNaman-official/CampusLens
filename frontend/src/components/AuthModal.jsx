import { useEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import Icon from './Icon'
import { confirmPasswordReset, register, requestPasswordReset, resendOtp, signIn, verifyOtp } from '../services/api'

const inputClass = 'mt-1.5 w-full rounded-xl border border-[#53644f] bg-[#1c271b] px-4 py-3 text-white outline-none focus:border-[#d7f46d]'

function AuthModal({ initialMode = 'login', initialEmail = '', onClose, onSuccess }) {
  const [mode, setMode] = useState(initialMode)
  const [form, setForm] = useState({ username: '', email: initialEmail, password: '', otp: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [visible, setVisible] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(0)
  const panelRef = useRef(null)
  const markRef = useRef(null)
  const verifying = mode === 'verify'
  const login = mode === 'login'
  const resetting = mode.startsWith('reset-')

  useEffect(() => {
    const animations = []
    if (panelRef.current) animations.push(animate(panelRef.current, { opacity: [0, 1], scale: [.94, 1], translateY: [20, 0], duration: 600, ease: 'outExpo' }))
    if (markRef.current) animations.push(animate(markRef.current, { translateY: [0, -3], duration: 1400, ease: 'inOutSine', alternate: true, loop: true }))
    return () => animations.forEach(animation => animation.revert())
  }, [])
  useEffect(() => {
    if (!resendSeconds) return undefined
    const timer = window.setInterval(() => setResendSeconds(seconds => Math.max(0, seconds - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [resendSeconds])

  const update = (name, value) => setForm(current => ({ ...current, [name]: value }))
  const otpError = requestError => {
    const message = requestError.message || 'CampusLens could not verify that code.'
    if (/expired/i.test(message)) return 'This code has expired. Request a new one and try again.'
    if (/attempt/i.test(message)) return 'Too many verification attempts. Request a new code and try again.'
    if (/No account found/i.test(message)) return 'No account was found with that email address.'
    return message
  }
  const showVerification = (message = '', cooldown = 0) => { setError(''); setNotice(message); setResendSeconds(cooldown); setMode('verify') }

  async function submit(event) {
    event.preventDefault(); setError(''); setNotice('')
    if (resetting) {
      if (!form.email.includes('@')) return setError('Enter the email address for your account.')
      setIsSubmitting(true)
      try {
        if (mode === 'reset-request') {
          const response = await requestPasswordReset(form.email)
          setNotice(response?.detail || 'If an account exists for this email, a reset code has been sent.')
          setMode('reset-confirm')
        } else {
          if (!/^\d{6}$/.test(form.otp)) return setError('Enter the 6-digit reset code from your email.')
          if (form.password.length < 8) return setError('Use a password with at least 8 characters.')
          const response = await confirmPasswordReset(form.email, form.otp, form.password)
          setNotice(response?.detail || 'Password reset successfully. You can now sign in.')
          setMode('reset-done')
        }
      } catch (requestError) {
        if (requestError.status === 429) setResendSeconds(requestError.retryAfter || 60)
        setError(requestError.retryAfter ? `Please wait ${requestError.retryAfter} seconds before requesting another reset code.` : otpError(requestError))
      } finally { setIsSubmitting(false) }
      return
    }
    if (verifying) {
      if (!form.email.includes('@')) return setError('Enter the email address for the account you want to verify.')
      if (!/^\d{6}$/.test(form.otp)) return setError('Enter the 6-digit code from your email.')
      setIsSubmitting(true)
      try { await verifyOtp(form.email, form.otp); setMode('verified') } catch (requestError) { setError(otpError(requestError)) } finally { setIsSubmitting(false) }
      return
    }
    setIsSubmitting(true)
    try {
      if (login) onSuccess(await signIn(form.username, form.password))
      else { await register({ username: form.username, email: form.email, password: form.password }); showVerification('We sent a verification code to your email.', 60) }
    } catch (requestError) {
      if (login && /Please verify your email before logging in\./i.test(requestError.message)) {
        update('email', '')
        showVerification('Please verify your email before logging in. Enter the account email below to continue.')
      } else setError(requestError.message)
    } finally { setIsSubmitting(false) }
  }
  async function resend() {
    if (resendSeconds || isSubmitting) return
    if (!form.email.includes('@')) return setError('Enter the email address for the account you want to verify.')
    setError(''); setNotice(''); setIsSubmitting(true)
    try { const response = await resendOtp(form.email); setResendSeconds(60); setNotice(response?.detail || 'A new verification code has been sent.') }
    catch (requestError) { if (requestError.status === 429) setResendSeconds(requestError.retryAfter || 60); setError(requestError.retryAfter ? `Please wait ${requestError.retryAfter} seconds before requesting another code.` : otpError(requestError)) }
    finally { setIsSubmitting(false) }
  }

  const heading = verifying ? 'Verify your email.' : mode === 'verified' ? 'Email verified.' : mode === 'reset-request' ? 'Reset your password.' : mode === 'reset-confirm' ? 'Check your email.' : mode === 'reset-done' ? 'Password reset.' : login ? 'Welcome back.' : 'Start your campus story.'
  const intro = verifying ? 'Enter the six-digit code we sent to your email.' : mode === 'verified' ? 'Your email is ready to use with CampusLens.' : mode === 'reset-request' ? 'We’ll email a six-digit code to reset your password.' : mode === 'reset-confirm' ? 'Enter your reset code and choose a new password.' : mode === 'reset-done' ? 'Your password has been updated.' : login ? 'Sign in to see your documents and conversations.' : 'Save documents and answers in one place.'
  const submitLabel = isSubmitting ? (verifying ? 'Verifying…' : resetting ? 'Saving…' : 'Signing in…') : (verifying ? 'Verify email' : mode === 'reset-request' ? 'Send reset code' : mode === 'reset-confirm' ? 'Save new password' : login ? 'Sign in to CampusLens' : 'Create my account')
  return <div className="auth-art fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={heading}>
    <button onClick={onClose} className="absolute inset-0 cursor-default" aria-label="Close sign in window" />
    <section ref={panelRef} className="paper-texture relative w-full max-w-[430px] overflow-hidden rounded-[30px] border border-[#a7c46c] bg-[#132d1d]/95 p-6 shadow-[16px_18px_0_rgba(3,12,7,.6)] backdrop-blur-xl sm:p-8">
      <button onClick={onClose} className="absolute right-5 top-5 grid size-9 place-items-center rounded-full border border-[#52634d] text-[#d8e0d2] hover:bg-[#344332]" aria-label="Close"><Icon name="close" className="size-4" /></button>
      <div ref={markRef} className="grid size-12 place-items-center rounded-2xl bg-[#d7f46d] text-[#1d291c] shadow-[3px_3px_0_#f2b693]"><Icon name="book" className="size-6" /></div>
      <p className="mt-6 text-xs font-extrabold uppercase tracking-[.16em] text-[#d7f46d]">CampusLens account</p><h2 className="display-font mt-2 text-3xl font-bold tracking-[-.05em] text-[#f8f1dc]">{heading}</h2><p className="mt-2 text-sm leading-6 text-[#bfc9b7]">{intro}</p>
      {mode === 'verified' || mode === 'reset-done' ? (<div className="mt-6 rounded-2xl border border-[#87b85d] bg-[#203a24] p-4 text-sm text-[#d8e9cf]">{mode === 'verified' ? 'Your email address has been verified.' : notice}<button onClick={() => setMode('login')} className="mt-4 block font-bold text-[#d7f46d]">Return to login →</button></div>) : (<form onSubmit={submit} className="mt-6 space-y-3">
        {!verifying && !resetting && <label className="block text-sm font-semibold text-[#e6ecdf]">Username<input required value={form.username} onChange={event => update('username', event.target.value)} autoComplete="username" placeholder="your-campus-name" className={inputClass} /></label>}
        {(!login || verifying || resetting) && <label className="block text-sm font-semibold text-[#e6ecdf]">College email<input required value={form.email} onChange={event => update('email', event.target.value)} type="email" placeholder="you@college.edu" className={inputClass} /></label>}
        {(verifying || mode === 'reset-confirm') && <label className="block text-sm font-semibold text-[#e6ecdf]">{verifying ? 'Verification code' : 'Reset code'}<input required value={form.otp} onChange={event => update('otp', event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" placeholder="123456" className={`${inputClass} text-center text-lg tracking-[.5em]`} /></label>}
        {!verifying && mode !== 'reset-request' && <label className="block text-sm font-semibold text-[#e6ecdf]">{mode === 'reset-confirm' ? 'New password' : 'Password'}<span className="relative mt-1.5 block"><input required value={form.password} onChange={event => update('password', event.target.value)} type={visible ? 'text' : 'password'} minLength="8" placeholder="••••••••" className="w-full rounded-xl border border-[#53644f] bg-[#1c271b] px-4 py-3 pr-12 text-white outline-none focus:border-[#d7f46d]" /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#bfc9b7]">{visible ? 'Hide' : 'Show'}</button></span></label>}
        {error && <p role="alert" className="rounded-xl border border-[#eaa17e] bg-[#43261e]/40 px-3 py-2 text-sm text-[#f2b693]">{error}</p>}{notice && <p role="status" className="rounded-xl border border-[#87b85d] bg-[#203a24] px-3 py-2 text-sm text-[#d8e9cf]">{notice}</p>}
        <button disabled={isSubmitting} className="relative mt-3 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#d7f46d] px-4 py-3 font-bold text-[#1e291d] disabled:cursor-wait disabled:opacity-80">{isSubmitting && <span className="absolute inset-0 login-loading" />}{submitLabel} {!isSubmitting && <Icon name="arrow" className="size-4" />}</button>
        {verifying && <button type="button" disabled={isSubmitting || resendSeconds > 0} onClick={resend} className="w-full pt-2 text-sm font-bold text-[#d7f46d] disabled:cursor-not-allowed disabled:text-[#879382]">{resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend verification code'}</button>}
      </form>)}
      {!verifying && !resetting && mode !== 'verified' && <div className="mt-4 flex justify-between text-sm"><button onClick={() => { setError(''); setNotice(''); setMode('reset-request') }} className="text-[#d7f46d] hover:underline">Forgot password?</button><button onClick={() => { setError(''); setNotice(''); setMode(login ? 'register' : 'login') }} className="text-[#d7f46d] hover:underline">{login ? 'Create one' : 'Sign in'}</button></div>}
      {(verifying || resetting) && mode !== 'reset-done' && <button onClick={() => { setError(''); setNotice(''); setMode('login') }} className="mt-5 text-sm font-bold text-[#d7f46d] hover:underline">Back to login</button>}
    </section>
  </div>
}
export default AuthModal
