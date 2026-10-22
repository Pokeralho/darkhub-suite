import { Download } from '../components/icons';
import EmbeddedSitePage from '../components/EmbeddedSitePage';
import { useI18n } from '../i18n/I18nProvider';

const Juuzou = () => {
  const { t } = useI18n();
  return (
    <EmbeddedSitePage
      title={t('juuzou.title', 'Juuzou Downloads')}
      subtitle={t('juuzou.subtitle', 'Central de Downloads DarkHub')}
      url="https://juuzou.darkhub.ink/"
      icon={Download}
      accent="bg-indigo-500/10 text-indigo-400"
    />
  );
};

export default Juuzou;
