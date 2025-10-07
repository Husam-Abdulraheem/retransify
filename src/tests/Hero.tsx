import { Button } from "@/components/ui/button";
import { Mail, User } from "lucide-react"; 
import { useLanguage } from "@/hooks/useLanguage";
import me from "@/assets/me.jpg"; 
const Hero = () => {
  const { t, isRTL } = useLanguage();

  const scrollToContact = () => {
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (

    <section id="home" className="min-h-[50vh] flex items-center justify-center bg-gray-50 dark:bg-gray-950 py-16">
      <div className="container mx-auto px-4 text-center max-w-xl space-y-5">
        
        <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center bg-blue-600 text-white shadow-lg">
          <User className="h-8 w-8" />
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
          {t('hero.greeting')} - {t('hero.title')}
        </h1>
        
        <div className="pt-2">
          <Button 
            onClick={scrollToContact} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full text-sm"
          >
            <Mail className={`${isRTL ? 'ml-2' : 'mr-2'} h-4 w-4`} />
            {t('hero.contactMe')}
          </Button>
        </div>
        
      </div>
    </section>
  );
};

export default Hero;