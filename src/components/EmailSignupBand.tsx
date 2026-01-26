import { useState } from 'react';
import { BannerMessage } from './BannerMessage';
import { subscribeToEmailList } from '../lib/api';

type EmailSignupBandProps = {
  withBackground?: boolean;
  sectionClassName?: string;
};

export function EmailSignupBand({ withBackground = true, sectionClassName = '' }: EmailSignupBandProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'exists' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setStatus('idle');
    setErrorMessage('');

    try {
      const result = await subscribeToEmailList(email.trim());
      if (result.alreadySubscribed) {
        setStatus('exists');
      } else {
        setStatus('success');
      }
      setEmail('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signup failed. Please try again.';
      setErrorMessage(message);
      setStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      className={`py-16 md:py-24 ${withBackground ? 'bg-[#F8F5F0]' : ''} ${sectionClassName}`.trim()}
    >
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-serif font-semibold text-gray-900">
            Join the Email List
          </h2>
          <p className="mt-3 text-sm md:text-base text-gray-600">
            Early access to new drops, restocks, and studio updates.
          </p>
        </div>

        <div className="mt-8">
          {status === 'success' && (
            <BannerMessage
              type="success"
              message="You're subscribed! Watch your inbox for new releases."
            />
          )}
          {status === 'exists' && (
            <BannerMessage type="info" message="You're already on the list. Thanks for staying close!" />
          )}
          {status === 'error' && (
            <BannerMessage type="error" message={errorMessage || 'Signup failed. Please try again.'} />
          )}

          <form
            onSubmit={handleSubmit}
            className="mx-auto w-full max-w-3xl rounded-2xl md:rounded-full border border-gray-200 bg-white shadow-sm p-2 md:p-3"
          >
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@email.com"
                className="flex-1 rounded-full md:rounded-full border border-gray-200 md:border-transparent px-4 py-3 md:py-2 text-sm md:text-base outline-none focus:ring-2 focus:ring-gray-900"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full md:w-auto rounded-full bg-gray-900 px-6 py-3 md:py-2 text-sm md:text-base font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Joining...' : 'Join the list'}
              </button>
            </div>
          </form>

          <p className="mt-4 text-xs text-gray-500 text-center">
            We only send occasional updates. No spam. Unsubscribe anytime.
          </p>
        </div>
      </div>
    </section>
  );
}
