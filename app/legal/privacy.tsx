import LegalScreen from '@/components/LegalScreen';

export default function PrivacyPolicy() {
  return (
    <LegalScreen
      title="Privacy Policy"
      lastUpdated="February 2026"
      subtitle="Scandinordic (Sole Business) · Karstulantie, Helsinki, Finland · support@scandinordic.fi"
      sections={[
        {
          heading: '1. Introduction',
          body: [
            'This Privacy Policy explains how Scandinordic ("we", "our", "the Company") collects, uses, stores, and protects personal data through the application Scandinordic Pro. We comply with:',
            '· EU General Data Protection Regulation (GDPR)\n· Finnish Data Protection Act',
            'By using our app or website, you agree to this policy.',
          ],
        },
        {
          heading: '2. Data We Collect',
          body: [
            'We collect the following data when provided by the user:',
            '· Personal identification data: full name, email address, phone number\n· Business and financial data: business details, income and expense entries, VAT information, invoices, receipt images, customer/supplier data, financial transaction amounts\n· Device and technical data: device type (Android/iOS), IP address, browser information, usage logs, app performance data\n· Location data: GPS location only when required (optional)\n· Cookies (website only): session cookies, analytics cookies (anonymised)',
          ],
        },
        {
          heading: '3. How We Use the Data',
          body: [
            '· Providing bookkeeping and accounting features\n· Generating invoices and VAT calculations\n· Storing receipts and business documents\n· Improving app performance\n· Customer support\n· Security and fraud prevention\n· AI-powered features (classification, OCR, automation)',
          ],
        },
        {
          heading: '4. AI Processing',
          body: [
            'Some features use AI for: categorising expenses, extracting text from receipts, generating invoice content, and automating financial summaries.',
            'AI receives only the necessary data. Personal data is anonymised whenever possible.',
          ],
        },
        {
          heading: '5. Legal Basis for Processing',
          body: [
            '· Contract: to provide the service you request\n· Legal obligation: bookkeeping data must be stored according to Finnish tax laws\n· Consent: optional AI features and cookies\n· Legitimate interest: improving app quality and security',
          ],
        },
        {
          heading: '6. Data Storage',
          body: [
            'Data is stored on GDPR-compliant cloud infrastructure hosted in the EU (or equivalent adequate jurisdictions), using encrypted databases and industry-standard security practices.',
          ],
        },
        {
          heading: '7. Data Retention',
          body: [
            '· Accounting data: 6–10 years (as required by Finnish law)\n· Account data: until the user deletes their account\n· Cookies: up to 12 months\n· Backups: up to 90 days',
          ],
        },
        {
          heading: '8. Your Rights',
          body: [
            'Under GDPR, you have the right to:',
            '· Access your data\n· Correct inaccurate data\n· Request deletion of data (when legally possible)\n· Restrict processing\n· Request data export (CSV or PDF)\n· Withdraw consent\n· Lodge a complaint with the Finnish Data Protection Ombudsman',
          ],
        },
        {
          heading: '9. Data Security',
          body: [
            'We use: encrypted connections (HTTPS), secure authentication, encrypted databases, access control and logging, and regular security reviews.',
          ],
        },
        {
          heading: '10. Sharing of Data',
          body: [
            'We do not sell personal data. We may share data only with: cloud hosting and infrastructure providers, AI processing tools, and legal authorities when required by law.',
            'All such parties are bound by data protection agreements and must comply with GDPR.',
          ],
        },
        {
          heading: '11. Contact',
          body: ['For privacy questions or requests, contact: support@scandinordic.fi'],
        },
      ]}
    />
  );
}
