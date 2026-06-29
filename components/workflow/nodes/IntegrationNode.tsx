'use client';

/**
 * IntegrationNode — workflow node that executes an action on a connected project.
 *
 * Shows the project name, action name, and how many parameter mappings are
 * configured in the collapsed card view.
 */

import React from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';
import type { WorkflowNodeData, IntegrationNodeConfig } from '@/lib/workflow/types';
import { getAllProjects } from '@/lib/integrations/registry';
import { registerContractorsRoom } from '@/lib/integrations/contractors-room';

type IntegrationNodeType = Node<WorkflowNodeData>;

// Ensure the registry is populated when the canvas loads
registerContractorsRoom();

export function IntegrationNode({ data, selected }: NodeProps<IntegrationNodeType>) {
  const config = data.config as IntegrationNodeConfig;

  const allProjects = getAllProjects();
  const project = allProjects.find((p) => p.id === config.projectId);
  const action = project?.actions.find((a) => a.id === config.actionId);

  const mappingCount = config.parameterMapping?.length ?? 0;

  return (
    <BaseNode
      nodeType="integration"
      label={data.label}
      status={data.status}
      selected={selected}
      executionOutput={data.executionOutput}
      executionError={data.executionError}
    >
      {config.projectId ? (
        <>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Project:</span>
            <span className="text-blue-300 truncate">{project?.name ?? config.projectId}</span>
          </div>
          {config.actionId && (
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Action:</span>
              <span className="text-white truncate">{action?.name ?? config.actionId}</span>
            </div>
          )}
          {mappingCount > 0 && (
            <div className="text-gray-600">
              {mappingCount} param{mappingCount !== 1 ? 's' : ''} mapped
            </div>
          )}
        </>
      ) : (
        <p className="text-gray-600 italic">Configure project and action</p>
      )}
    </BaseNode>
  );
}
