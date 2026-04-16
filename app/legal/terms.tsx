import LegalScreen from '@/components/LegalScreen';

export default function TermsOfService() {
  return (
    <LegalScreen
      title="Terms of Service"
      lastUpdated="February 2026"
      sections={[
        {
          heading: '1. Introduction',
          body: [
            'These Terms of Service govern your use of the app Scandinordic Pro, provided by Scandinordic (Sole Business), based in Helsinki, Finland. By creating an account or using the service, you agree to these Terms.',
          ],
        },
        {
          heading: '2. Use of the Service',
          body: [
            'You agree to:',
            '· Provide accurate information when using the app\n· Use the service only for lawful business purposes\n· Not attempt to hack, reverse engineer, or disrupt the service\n· Respect intellectual property rights',
          ],
        },
        {
          heading: '3. Subscription and Payments',
          body: [
            'Some features may require a paid subscription.',
            '· Prices and plans are shown in the app or on the website\n· We may change pricing with reasonable prior notice\n· Refunds are handled according to Finnish consumer law and our refund policy',
          ],
        },
        {
          heading: '4. User Responsibilities',
          body: [
            'You are responsible for:',
            '· The accuracy of the financial and bookkeeping data you enter\n· Keeping your login credentials safe\n· Complying with local tax and accounting regulations\n· Keeping copies of critical invoices, receipts, and records when required by law',
          ],
        },
        {
          heading: '5. Our Responsibilities',
          body: [
            'We provide:',
            '· Tools to help you organise your bookkeeping, VAT calculations, invoices, and financial records\n· A reasonable level of uptime and maintenance\n· Support via the provided contact channels',
            'We do not act as your official accountant or tax advisor. The service provides tools and automation, but final responsibility for compliance stays with you.',
          ],
        },
        {
          heading: '6. Termination',
          body: [
            'We may suspend or terminate your access if:',
            '· You violate these Terms\n· We detect abuse, fraud, or suspicious activity\n· We are required to do so by law or a court order',
            'You may stop using the service or close your account at any time.',
          ],
        },
        {
          heading: '7. Limitation of Liability',
          body: [
            'To the maximum extent permitted by law:',
            '· We are not liable for indirect, incidental, or consequential damages, including lost profits or data\n· We are not responsible for errors caused by incorrect data entered by users or third-party providers',
            'The service is provided "as is" and "as available", with reasonable care but without guaranteed perfection.',
          ],
        },
        {
          heading: '8. Changes to the Terms',
          body: [
            'We may update these Terms from time to time. The latest version will always be available in the app or on the website. Continued use of the service means you accept the updated Terms.',
          ],
        },
        {
          heading: '9. Governing Law',
          body: [
            'These Terms are governed by Finnish law. Any disputes will primarily be resolved amicably; if not possible, they may be brought before the competent courts in Helsinki, Finland.',
          ],
        },
      ]}
    />
  );
}
