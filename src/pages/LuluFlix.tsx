import { PlaySquare } from '../components/icons';
import EmbeddedSitePage from '../components/EmbeddedSitePage';
import { useI18n } from '../i18n/I18nProvider';

const LuluFlix = () => {
  const { t } = useI18n();
  return (
    <EmbeddedSitePage
      title={t('luluflix.title', 'LuluFlix')}
      subtitle={t('luluflix.subtitle', 'Plataforma de Streaming DarkHub')}
      url="https://luluflix.darkhub.ink/"
      icon={PlaySquare}
      accent="bg-red-500/10 text-red-400"
    />
  );
};

export default LuluFlix;
