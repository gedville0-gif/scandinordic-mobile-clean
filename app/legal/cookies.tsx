import LegalScreen from '@/components/LegalScreen';

export default function CookiePolicy() {
  return (
    <LegalScreen
      title="Cookie Policy"
      lastUpdated="February 2026"
      sections={[
        {
          heading: '1. What Are Cookies?',
          body: [
            'Cookies are small text files stored on your device when you visit a website. They help us provide basic functionality, remember preferences, and understand how the service is used.',
          ],
        },
        {
          heading: '2. Types of Cookies We Use',
          body: [
            '· Strictly necessary cookies: required for login, security, and core functionality\n· Preference cookies: for remembering language and interface settings\n· Analytics cookies: anonymised analytics to understand basic usage trends and improve the service',
          ],
        },
        {
          heading: '3. How We Use Cookies',
          body: [
            '· Keep you logged in\n· Remember your basic preferences\n· Measure usage of pages and features (in an anonymised way)',
          ],
        },
        {
          heading: '4. Managing Cookies',
          body: [
            'You can:',
            '· Change cookie settings in your browser\n· Delete existing cookies\n· Block non-essential cookies if you wish',
            'Note: blocking some cookies may affect the functionality of the app or website.',
          ],
        },
        {
          heading: '5. Contact',
          body: ['For questions about cookies, contact: support@scandinordic.fi'],
        },
      ]}
    />
  );
}
