// Component Imports
import Image from '@repo/ui/components/Image'

type DataProps = {
  id: number
  imgSrc: string
}

// Data
const logoData: DataProps[] = [
  {
    id: 1,
    imgSrc: '/images/logos/nextjs.png'
  },
  {
    id: 2,
    imgSrc: '/images/logos/typescript.png'
  },
  {
    id: 3,
    imgSrc: '/images/logos/tailwind.png'
  },
  {
    id: 4,
    imgSrc: '/images/logos/supabase.png'
  },
  {
    id: 5,
    imgSrc: '/images/logos/stripe.png'
  },
  {
    id: 6,
    imgSrc: '/images/logos/lemon-squeezy.png'
  },
  {
    id: 7,
    imgSrc: '/images/logos/auth.png'
  }
]

const LeftSection = () => {
  return (
    <div className="relative basis-0 bg-[url('/images/pages/background-v2.png')] bg-cover bg-center bg-no-repeat lg:basis-3/5 xl:basis-2/3">
      <div className="flex min-h-full flex-col items-center justify-center bg-[url('/svg/auth-bg-shape.svg')] bg-center bg-no-repeat">
        <Image
          srcLight='/images/pages/auth/dashboard-light.png'
          srcDark='/images/pages/auth/dashboard-dark.png'
          alt='dashboard'
          className='is-[520px] bs-auto mli-auto object-contain'
        />
      </div>
      <div
        className='plb-1.5 pli-2 bg-card block-end-16 inline-start-1/2 absolute flex -translate-x-1/2 gap-1.5 rounded-md max-lg:hidden'
        style={{
          boxShadow: '0px 4px 34px 0px rgba(0, 0, 0, 0.16)'
        }}
      >
        {logoData.map(data => (
          <img key={data.id} src={data.imgSrc} alt='logo' className='is-[28px] bs-auto rounded-md object-contain' />
        ))}
      </div>
    </div>
  )
}

export default LeftSection
