import LegalScreen from '@/components/LegalScreen';

export default function DataProcessingAgreement() {
  return (
    <LegalScreen
      title="Data Processing Agreement"
      lastUpdated="February 2026"
      sections={[
        {
          heading: '1. Parties',
          body: [
            '· Data Controller: The customer (user or business using Scandinordic Pro)\n· Data Processor: Scandinordic (Sole Business), operating the Scandinordic Pro app',
          ],
        },
        {
          heading: '2. Purpose',
          body: [
            'The purpose of this DPA is to define how we process personal and financial data on behalf of the customer for:',
            '· Bookkeeping and accounting\n· VAT calculations and reporting\n· Invoice creation and storage\n· Receipt image storage\n· Financial analysis and automation',
          ],
        },
        {
          heading: '3. Processor Obligations',
          body: [
            'As Data Processor, we agree to:',
            '· Process personal data only on documented instructions from the Data Controller\n· Keep personal data confidential\n· Implement appropriate technical and organisational security measures\n· Assist the Data Controller in fulfilling GDPR obligations where reasonable (e.g. data access, deletion, and export requests)\n· Delete or return personal data upon termination of the service, subject to legal retention requirements',
          ],
        },
        {
          heading: '4. Sub-processors',
          body: [
            'We may use sub-processors, such as: cloud hosting providers, database and storage providers, and AI processing tools and infrastructure.',
            'All sub-processors must be bound by written agreements and must provide GDPR-compliant data protection guarantees.',
          ],
        },
        {
          heading: '5. International Transfers',
          body: [
            'If data is transferred outside the EU/EEA, we will ensure adequate safeguards (e.g. Standard Contractual Clauses or equivalent mechanisms), in accordance with GDPR requirements.',
          ],
        },
        {
          heading: '6. Data Breach Notification',
          body: [
            'In the event of a data breach affecting personal data processed on behalf of the customer, we will:',
            '· Notify the customer without undue delay after becoming aware of the breach\n· Provide available information about the nature of the breach and mitigation steps',
          ],
        },
        {
          heading: '7. Duration',
          body: [
            'This DPA applies for as long as Scandinordic Pro processes personal data on behalf of the customer. After termination of the service and after legal retention periods expire, personal data will be deleted or anonymised.',
          ],
        },
      ]}
    />
  );
}
