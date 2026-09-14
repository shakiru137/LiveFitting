import type { Dress } from '../types';

export const DRESSES: Dress[] = [
  {
    id: 'liquid-silk-slip',
    title: 'The Liquid Silk Cowl Neck Slip',
    subtitle: 'Bias-cut heavy silk crepe satin dress with open back drape',
    category: 'Parties',
    price: 290,
    originalPrice: 345,
    rating: 4.9,
    reviewCount: 98,
    styleTag: 'Iconic Minimalist',
    silhouetteType: 'slip',
    description: 'Effortless sophistication engineered through precision bias cutting. Liquid silk hugs your natural curves before cascading into a fluid floor-brushing skirt. Features ultra-fine crossover shoulder straps and a low cowl back.',
    fitDetails: [
      'Precision bias-cut silhouette that conforms naturally to body contours',
      'Adjustable delicate crossover silk straps',
      'Dramatic low cowl back cutouts',
      'Floor-length hem designed to drape with 3"-4" heels',
      'Model is 5\'10" (178cm) wearing UK Size 8'
    ],
    fabricCare: [
      '100% Pure Mulberry Silk Satin (19 momme weight)',
      'Luxury Silk-Touch Lining',
      'Dry clean only',
      'Steam gently on low temperature'
    ],
    deliveryInfo: 'Complimentary Express Worldwide Shipping (1-2 business days). Returns accepted within 28 days with door-to-door courier collection.',
    colors: [
      {
        id: 'blush-rose',
        name: 'Blush Rose Quartz',
        hex: '#E8D2C5',
        glbPath: '/garments/slip_blush.glb',
        overlayHueShift: 15,
        overlaySatMultiplier: 1.0,
        overlayLightnessMultiplier: 1.1,
        image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85'
      },
      {
        id: 'champagne-gold',
        name: 'Champagne Satin',
        hex: '#E4D4B8',
        glbPath: '/garments/slip_champagne.glb',
        overlayHueShift: 40,
        overlaySatMultiplier: 1.1,
        overlayLightnessMultiplier: 1.2,
        image: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=1200&q=85'
      },
      {
        id: 'midnight-noir',
        name: 'Noir Silk',
        hex: '#1D1D1D',
        glbPath: '/garments/slip_noir.glb',
        overlayHueShift: 0,
        overlaySatMultiplier: 0.2,
        overlayLightnessMultiplier: 0.2,
        image: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=1200&q=85'
      }
    ],
    photos: [
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=1200&q=85'
    ],
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-fashion-model-in-a-black-dress-41315-large.mp4',
    completeTheLook: [
      {
        id: 'acc-1',
        title: 'Minimalist Metallic Ankle Strap Heels',
        category: 'Footwear',
        price: 210,
        image: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=600&q=80'
      },
      {
        id: 'acc-2',
        title: 'Champagne Pearl Frame Clutch',
        category: 'Accessories',
        price: 145,
        image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=600&q=80'
      },
      {
        id: 'acc-3',
        title: 'Delicate Drop Diamond Earrings',
        category: 'Jewellery',
        price: 175,
        image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=600&q=80'
      }
    ],
    reviews: [
      {
        id: 'rev-1',
        author: 'Camilla Rossi',
        verified: true,
        rating: 5,
        date: '3 days ago',
        height: "5'7\"",
        sizePurchased: 'UK 6',
        fitRating: 'True to Size',
        title: 'Silk quality is out of this world',
        comment: 'Drapes like a dream! The Live Fitting Room let me test the 360 rotation to see how the back cowl fell while walking. It was spot on.'
      },
      {
        id: 'rev-2',
        author: 'Eleanor Vance',
        verified: true,
        rating: 5,
        date: '1 week ago',
        height: "5'9\"",
        sizePurchased: 'UK 8',
        fitRating: 'True to Size',
        title: 'Wore this for my 25th Birthday Dinner',
        comment: 'I received endless compliments. The fabric feels weightless and silky soft.'
      }
    ]
  },
  {
    id: 'midnight-contour-gown',
    title: 'The Midnight Contour Gala Gown',
    subtitle: 'Off-the-shoulder sculpted velvet dress with side split',
    category: 'Evening events',
    price: 385,
    originalPrice: 450,
    rating: 4.9,
    reviewCount: 142,
    styleTag: 'Red Carpet Gala',
    silhouetteType: 'gown',
    description: 'Designed to command the room, this floor-sweeping gown is crafted from rich stretch velvet that molds seamlessly to your silhouette. Features an architectural corseted bodice and off-the-shoulder draping.',
    fitDetails: [
      'Tailored stretch-fit bodice with internal boning',
      'Thigh-high asymmetrical side slit',
      'Floor-length hem designed for heels',
      'Model is 5\'10" wearing UK Size 8'
    ],
    fabricCare: [
      'Italian Stretch Velvet (92% Polyester, 8% Elastane)',
      'Silk Touch Viscose Lining',
      'Dry clean only'
    ],
    deliveryInfo: 'Complimentary Express Worldwide Shipping (1-2 business days).',
    colors: [
      {
        id: 'noir-velvet',
        name: 'Noir Velvet',
        hex: '#16161B',
        overlayHueShift: 0,
        overlaySatMultiplier: 0.2,
        overlayLightnessMultiplier: 0.2,
        image: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=1200&q=85'
      },
      {
        id: 'emerald-deep',
        name: 'Imperial Emerald',
        hex: '#0A3B2B',
        overlayHueShift: 140,
        overlaySatMultiplier: 1.2,
        overlayLightnessMultiplier: 0.4,
        image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85'
      }
    ],
    photos: [
      'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85'
    ],
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-fashion-model-in-a-black-dress-41315-large.mp4',
    completeTheLook: [
      {
        id: 'acc-1',
        title: 'Minimalist Metallic Ankle Strap Heels',
        category: 'Footwear',
        price: 210,
        image: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=600&q=80'
      }
    ],
    reviews: [
      {
        id: 'rev-3',
        author: 'Sophia Martinez',
        verified: true,
        rating: 5,
        date: '2 weeks ago',
        height: "5'8\"",
        sizePurchased: 'UK 10',
        fitRating: 'True to Size',
        title: 'Felt like a celebrity',
        comment: 'The corseted waist is so flattering and comfortable.'
      }
    ]
  },
  {
    id: 'elysian-corseted-gown',
    title: 'The Elysian Corseted Tiered Gown',
    subtitle: 'Romantic tulle gown with hand-pleated corset and flowing skirt',
    category: 'Weddings',
    price: 420,
    originalPrice: 480,
    rating: 5.0,
    reviewCount: 67,
    styleTag: 'Haute Romance',
    silhouetteType: 'tulle',
    description: 'An ethereal creation designed for weddings and grand celebrations. Features a translucent boned bodice, sweet-heart neckline, and layers of weightless pleated tulle that catch the breeze effortlessly.',
    fitDetails: [
      'Semi-sheer boned corset top with padded bust cups',
      'Multi-tiered voluminous micro-pleated skirt',
      'Floor length with subtle chapel sweep train',
      'Model is 5\'11" wearing UK Size 8'
    ],
    fabricCare: [
      '100% Fine Italian Silk Tulle',
      'Polyester Micro-mesh lining',
      'Dry clean only'
    ],
    deliveryInfo: 'Complimentary Express Worldwide Shipping.',
    colors: [
      {
        id: 'blush-tulle',
        name: 'Blush Ivory',
        hex: '#F4EFEA',
        overlayHueShift: 20,
        overlaySatMultiplier: 0.8,
        overlayLightnessMultiplier: 1.3,
        image: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=1200&q=85'
      }
    ],
    photos: [
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=1200&q=85'
    ],
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-fashion-model-in-a-black-dress-41315-large.mp4',
    completeTheLook: [
      {
        id: 'acc-2',
        title: 'Champagne Pearl Frame Clutch',
        category: 'Accessories',
        price: 145,
        image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=600&q=80'
      }
    ],
    reviews: [
      {
        id: 'rev-4',
        author: 'Isabelle Thorne',
        verified: true,
        rating: 5,
        date: '5 days ago',
        height: "5'6\"",
        sizePurchased: 'UK 8',
        fitRating: 'True to Size',
        title: 'Perfection for my rehearsal dinner',
        comment: 'The movement of the tulle layers is magical.'
      }
    ]
  }
];
