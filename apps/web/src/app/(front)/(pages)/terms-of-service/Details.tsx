// Next Imports
import Link from 'next/link'

// Third-party Imports
import { cn } from '@repo/ui/lib/utils'
import { Card, CardContent } from '@repo/ui/components/ui/card'

// Util Imports
import { getAppName } from '@/utils/getAppName'

// Styles Imports
import frontCommonStyles from '../styles.module.css'

const Details = async () => {
  // Vars
  const appName = await getAppName()

  return (
    <div className={cn('bs-full plb-10 sm:plb-20', frontCommonStyles.layoutSpacing)}>
      <Card>
        <CardContent className='pbs-4'>
          <div className='flex flex-col gap-y-4'>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Introduction</h3>
              <p>
                Welcome to <Link href='/' className='text-primary'>{`${appName}`}</Link> operated by CleVision
                Technologies Private Limited (&quot;us&quot;, &quot;we&quot;, or &quot;our&quot;). By accessing or using
                our services, including our software products and SaaS boilerplates (&quot;Product&quot;), you agree to
                these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, please do not use our
                services or purchase our Products.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Eligibility</h3>
              <p>
                You must be at least 18 years old to use our services or purchase our Products. By using our services or
                making a purchase, you confirm that you meet this age requirement.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Acceptance of Terms</h3>
              <p>
                By accessing our services or purchasing our Products, you accept these Terms and our Privacy Policy. If
                you do not agree with these Terms, please discontinue use or refrain from purchasing.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Accounts and Registration</h3>
              <p>
                When creating an account to access or purchase our Products, you must provide accurate and complete
                information. You are responsible for safeguarding your account credentials and for all activities under
                your account. Report any unauthorized access to us immediately.
              </p>
            </div>
            <div>
              <h3 className='mb-2 text-xl font-semibold'>Use of the Service and Products</h3>
              <p className='mb-2'>
                You agree not to misuse our services or Products, which includes but is not limited to:
              </p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>Engaging in illegal or unethical activities.</li>
                <li>Interfering with or disrupting the operation of the service or product.</li>
                <li>Attempting to reverse-engineer or tamper with the software.</li>
                <li>Accessing the service or Product through unauthorized methods.</li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Product Pricing and Changes</h3>
              <p>
                Our Products are sold on a one-off purchase basis with no recurring subscription fees. We reserve the
                right to change prices at any time without prior notice. Once a purchase is completed, the price at the
                time of purchase is final for that transaction.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Refunds</h3>
              <p>
                Refund requests for purchases will be considered on a case-by-case basis and are granted at our sole
                discretion. Refunds are generally not issued unless there is a significant issue with the Product. If a
                refund is approved, it will be processed using the original payment method.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Ownership and License to Use</h3>
              <p>
                Upon purchasing our SaaS Boilerplate or any other Product, you are granted a non-exclusive,
                non-transferable license to use and modify the Product. However, you may not resell, redistribute, or
                sublicense the Product without our explicit written permission.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Customization and Support</h3>
              <p>
                Our Products, including SaaS Boilerplates, are designed using the modern stack of Next.js, Typescript,
                Shadcn, Tailwind CSS, and Supabase. Initial setup documentation is provided, but ongoing support or
                extended development services are not included unless explicitly agreed upon. Additional support
                packages may be offered separately.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>User Content</h3>
              <p>
                You are responsible for any content you post or share within the service (such as reviews or feedback).
                By posting, you grant us a non-exclusive, perpetual license to use, distribute and display your content.
                We reserve the right to remove any content that violates our Terms or applicable laws.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Intellectual Property</h3>
              <p>
                All intellectual property related to our Products, including code, documentation, and branding, remains
                the property of CleVision Technologies Private Limited. You may not reproduce, distribute, or use any of
                our materials beyond the scope of the license granted without prior written consent.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Third-Party Links</h3>
              <p>
                Our Products may contain links to third-party websites or services. We do not control or endorse
                third-party sites and are not responsible for their content or practices. Use these external resources
                at your own risk.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Termination</h3>
              <p>
                We reserve the right to terminate or suspend your access to our services or Products if these Terms are
                violated. In the event of termination due to breach of these Terms, any granted license will be revoked,
                and no refund will be provided.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Limitation of Liability</h3>
              <p>
                We are not liable for any indirect, incidental, special, or consequential damages, including loss of
                data, profits, or use, arising from the use or inability to use our Products or services.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Disclaimer of Warranties</h3>
              <p>
                Our Products are provided &quot;as is&quot; without warranties of any kind. We do not guarantee
                uninterrupted, error-free operation or that any defects will be corrected. Your use of the Products is
                at your own risk.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Indemnification</h3>
              <p>
                You agree to indemnify and hold CleVision Technologies Private Limited harmless from any claims,
                damages, or liabilities arising from your use of the Products, violation of these Terms, or any
                unauthorized use of the services.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Governing Law</h3>
              <p>
                These Terms are governed by the laws of Gujarat, India. Any disputes arising in relation to these Terms
                will be resolved in the courts of Gujarat.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Changes to the Terms</h3>
              <p>
                We reserve the right to modify these Terms at any time. Any changes will be posted on our website, and
                your continued use of the service or Product after changes are posted signifies your acceptance of the
                updated Terms.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-xl font-semibold'>Contact Us</h3>
              <p>
                For any questions or concerns regarding these Terms or our Products, you can reach out to us via our{' '}
                <Link href='https://themeselection.com/contact-us' className='text-primary'>
                  contact page.
                </Link>
              </p>
            </div>
            <div>
              <h3 className='mb-2 text-xl font-semibold'>Cookie Policy</h3>
              <h4 className='mb-2 font-semibold'>1. Use of Cookies</h4>
              <p className='mb-2'>
                We use cookies to improve your experience on our website. You can manage cookie preferences through your
                browser settings, but please note that disabling cookies may affect website functionality.
              </p>
              <h4 className='mb-2 font-semibold'>2. Types for Cookies</h4>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <span className='font-semibold'>Essential Cookies: </span>Necessary for the website to function.
                </li>
                <li>
                  <span className='font-semibold'>Performance Cookies: </span>Collect information on how you use the
                  website.
                </li>
                <li>
                  <span className='font-semibold'>Functionality Cookies: </span>Remember your preferences.
                </li>
                <li>
                  <span className='font-semibold'>Targeting Cookies: </span>Used to deliver relevant ads.
                </li>
              </ul>
            </div>
            <div>
              <h4 className='mb-2 font-semibold'>3. Managing Cookies</h4>
              <p>
                You can control cookies through your browser settings. Disabling cookies may affect website
                functionality.
              </p>
            </div>
            <div>
              <h4 className='mb-2 font-semibold'>4. Changes to the Cookie Policy</h4>
              <p>We may update this policy. Changes will be posted on this page.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default Details
