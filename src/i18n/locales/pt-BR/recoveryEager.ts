// pt-BR: the recovery strings needed before its screen loads (menu entry, shared error texts).
const dict: Record<string, string> = {
  "rescue.err.disk_mismatch": "Este backup foi feito em outro disco (tamanho ou identificador diferente). Nada foi gravado.",
  "rescue.err.same_disk": "Escolha um destino em OUTRO disco: gravar no disco que está sendo lido sobrescreveria os próprios dados.",
  "rescue.err.same_disk_unknown": "Não foi possível confirmar em qual disco o destino fica (pasta de rede, unidade virtual ou ponto de montagem sem disco). Escolha uma pasta em uma unidade local de outro disco.",
  "nav.diskrescue": "Disk Studio & Rescue"
};

export default dict;
