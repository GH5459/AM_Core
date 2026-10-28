import {createContractManagementService} from './contract-management.js';
import {resolveAuthoritativeContractGroup} from './contract-authority.js';
import {sameId} from './common.js';
export async function synchronizeContractGroup(deps,context,input) {
  const management=createContractManagementService({store:deps.contractStore});
  const detail=await management.getContractDetail(context,{contractId:input.contractId});
  const c=detail.contract;
  const page=await deps.notionRequest('/v1/pages/'+encodeURIComponent(c.notionContractPageId),{method:'GET'});
  if(page.archived||page.in_trash||!sameId(page.parent?.data_source_id,deps.dataSources.contracts)
    ||!(page.properties?.['專案']?.relation||[]).some(p=>sameId(p.id,c.projectId)))
    throw Object.assign(new Error('合約與工程專案來源不一致。'),{statusCode:403});
  const group=page.properties?.['負責群組']?.relation?.[0]?.id||'';
  const current=c.groupBindingId||c.group_binding_id||c.group_binding_notion_page_id||'';
  if(sameId(group,current)||(!group&&!current))return {changed:false,contract:c};
  if(!group)throw Object.assign(new Error('請先在合約總覽設定負責群組。'),{statusCode:409});
  await resolveAuthoritativeContractGroup(deps,{groupBindingId:group,projectId:c.projectId});
  const result=await management.createOrSyncContract(context,{...c,
    budgetItemId:c.budgetItemId||c.budget_item_notion_page_id||'',groupBindingId:group});
  return {...result,changed:true};
}
