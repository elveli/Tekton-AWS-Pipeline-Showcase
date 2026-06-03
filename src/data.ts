export interface PipelineStage {
  id: string;
  title: string;
  icon: string;
  description: string;
  overview: string;
  files: {
    filename: string;
    language: string;
    content: string;
  }[];
}

export const pipelineStages: PipelineStage[] = [
  {
    id: "docs",
    title: "Documentation & Setup",
    icon: "FileText",
    description: "Read the comprehensive guide on configuring, running, and troubleshooting this pipeline.",
    overview: "This guide provides instructions on how to use these templates on your Amazon EKS cluster.",
    files: [
      {
        filename: "README.md",
        language: "markdown",
        content: `# Tekton AWS ECR & EKS Pipeline Complete Guide

Welcome to the **Tekton on AWS Sample Application**. This guide provides comprehensive instructions on how to take the configuration templates from this repository and apply them to a real Amazon EKS cluster.

## What You See

This sample contains a set of Kubernetes manifests for [Tekton Pipelines](https://tekton.dev/). When applied, they form a robust CI/CD pipeline that:
1. **Clones** source code from a Git repository.
2. **Builds** a Docker image without privileged access using Kaniko.
3. **Pushes** the container image to Amazon Elastic Container Registry (ECR) securely utilizing IAM Roles for Service Accounts (IRSA).
4. **Deploys** the new image to an Amazon Elastic Kubernetes Service (EKS) cluster using the \`kubectl\` task.

In this interactive dashboard, click through the stages on the left to view the specific \`.yaml\` configurations needed for each step.

---

## Prerequisites

Before executing this pipeline, you need:
1. **Amazon EKS Cluster**: An active Kubernetes cluster running on AWS.
2. **Tekton Installed**: Tekton Pipelines installed on your EKS cluster:
   \`kubectl apply --filename https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml\`
3. **OIDC Provider Enabled**: Your EKS cluster must have an IAM OIDC provider configured (required for IRSA).
4. **AWS ECR Repository**: A target container registry.
5. **Git Repository**: A repository containing a \`Dockerfile\` and some Kubernetes deployment manifests in a \`k8s/\` folder.

---

## Configuration & Setup

### 1. Configure IAM Roles for Service Accounts (IRSA)

IRSA is the most secure way for pods acting in your pipeline to push to ECR without long-lived credentials.

**A. Create an IAM Policy for ECR Access:**
Copy the policy from the "AWS IRSA Setup" stage (\`iam-policy.json\`) and create it in AWS IAM:
\`aws iam create-policy --policy-name TektonECRPushPolicy --policy-document file://iam-policy.json\`

**B. Create IAM Role mapped to the Service Account:**
Using \`eksctl\`, create an IAM role bound to the \`tekton-aws-sa\` ServiceAccount in the \`build-system\` namespace.
\`\`\`bash
eksctl create iamserviceaccount \\
  --cluster=<YOUR_CLUSTER_NAME> \\
  --namespace=build-system \\
  --name=tekton-aws-sa \\
  --attach-policy-arn=arn:aws:iam::<ACCOUNT_ID>:policy/TektonECRPushPolicy \\
  --approve
\`\`\`

### 2. Apply Tekton Tasks

You need to register the reusable "Tasks" with your cluster:

1. **Git Clone Task**:
   \`kubectl apply -f https://raw.githubusercontent.com/tektoncd/catalog/main/task/git-clone/0.9/git-clone.yaml\`
2. **Kaniko ECR Task**:
   \`kubectl apply -f 03-kaniko-ecr-task.yaml\`
3. **Deploy EKS Task**:
   \`kubectl apply -f 04-kubectl-deploy-task.yaml\`

### 3. Apply and Trigger the Pipeline

1. **Apply the Pipeline definition**:
   \`kubectl apply -f 05-pipeline.yaml\`

2. **Trigger the run**: Update parameters in \`06-pipelinerun.yaml\` to point to your specific repository and registry, then run:
   \`kubectl create -f 06-pipelinerun.yaml\`

---

## Troubleshooting Guide

### 1. ImagePullBackOff or unauthorized on push
**Cause**: The Kaniko task pod doesn't have the AWS credentials to push to ECR.
**Fix**: Verify the ServiceAccount (\`tekton-aws-sa\`) has the correct \`eks.amazonaws.com/role-arn\` annotation and the Trust Relationship allows the exact OIDC subject. Ensure \`AWS_SDK_LOAD_CONFIG="true"\` is passed to the Kaniko container.

### 2. fetch-repository fails with Authentication Error
**Cause**: The Git repository is private.
**Fix**: Create a Kubernetes Secret containing your Git credentials and attach it to the \`tekton-aws-sa\` ServiceAccount.

### 3. PipelineRun stays in Pending state
**Cause**: Usually a missing Workspace (PersistentVolumeClaim).
**Fix**: Ensure your cluster has a default StorageClass capable of dynamic provisioning, or manually create the PersistentVolume attached to the Workspace.

### 4. Deploy task fails with PermissionDenied
**Cause**: The Service Account lacks Kubernetes RBAC permissions to apply deployments.
**Fix**: Create a Role and RoleBinding granting edit access to \`tekton-aws-sa\` in the target namespace.`
      }
    ]
  },
  {
    id: "setup",
    title: "AWS IRSA Setup",
    icon: "Key",
    description: "Configure IAM Roles for Service Accounts to securely access AWS APIs.",
    overview: "Before a Tekton pipeline can push to Amazon ECR or deploy to Amazon EKS without hardcoded credentials, it needs to utilize IAM Roles for Service Accounts (IRSA). We create an IAM role with the necessary ECR permissions, and associate it with a Kubernetes ServiceAccount used by our Tekton TaskRuns and PipelineRuns.",
    files: [
      {
        filename: "01-service-account.yaml",
        language: "yaml",
        content: `apiVersion: v1
kind: ServiceAccount
metadata:
  name: tekton-aws-sa
  namespace: build-system
  annotations:
    # Associate this ServiceAccount with your AWS IAM Role configured for ECR access
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/TektonPipelineRole
secrets:
  # Optional: For private Git repository access
  - name: git-credentials
`
      },
      {
        filename: "iam-policy.json",
        language: "json",
        content: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:GetRepositoryPolicy",
        "ecr:DescribeRepositories",
        "ecr:ListImages",
        "ecr:DescribeImages",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "*"
    }
  ]
}`
      }
    ]
  },
  {
    id: "clone",
    title: "Fetch Source",
    icon: "GitBranch",
    description: "Clone the source code from a Git repository.",
    overview: "The first step in our Tekton pipeline is to retrieve the application source code. We use the standard 'git-clone' task from the Tekton Hub. It stores the checked-out source code into a Workspace backed by a PersistentVolumeClaim, so subsequent steps can access the code.",
    files: [
      {
        filename: "02-git-clone-task.yaml",
        language: "yaml",
        content: `# We use the standard git-clone task from tektoncd/catalog.
# You can install it directly on your cluster:
# kubectl apply -f https://raw.githubusercontent.com/tektoncd/catalog/main/task/git-clone/0.9/git-clone.yaml
#
# This relies on the Workspace (shared volume) attached to the PipelineRun.
`
      }
    ]
  },
  {
    id: "build-push",
    title: "Build & Push (ECR)",
    icon: "Package",
    description: "Build the Docker image and push to Amazon ECR.",
    overview: "We use Kaniko to build the Docker image without requiring a Docker daemon (rootless build). Kaniko natively supports Amazon ECR using the embedded 'docker-credential-ecr-login' helper. Because our PipelineRun uses our IRSA-configured ServiceAccount, Kaniko automatically assumes the IAM role and authentically pushes the image to our private ECR repository.",
    files: [
      {
        filename: "03-kaniko-ecr-task.yaml",
        language: "yaml",
        content: `apiVersion: tekton.dev/v1beta1
kind: Task
metadata:
  name: kaniko-ecr
  namespace: build-system
spec:
  workspaces:
    - name: source
      description: The workspace holding the source code
  params:
    - name: IMAGE
      description: Name (and tag) of the ECR image to build and push.
    - name: DOCKERFILE
      description: Path to the Dockerfile to build.
      default: ./Dockerfile
    - name: CONTEXT
      description: Path to the directory to use as context.
      default: ./
  steps:
    - name: build-and-push
      # Kaniko executor image
      image: gcr.io/kaniko-project/executor:latest
      workingDir: $(workspaces.source.path)
      env:
        # Use the IRSA credentials automatically fetched via AWS SDK inside Kaniko
        - name: AWS_SDK_LOAD_CONFIG
          value: "true"
      command:
        - /workspace/executor
      args:
        - --dockerfile=$(params.DOCKERFILE)
        - --context=$(workspaces.source.path)/$(params.CONTEXT)
        - --destination=$(params.IMAGE)
        # Instructs kaniko to use the AWS ECR credential helper
        - --verbosity=info
`
      }
    ]
  },
  {
    id: "deploy",
    title: "Deploy to EKS",
    icon: "Server",
    description: "Apply Kubernetes manifests to the target EKS cluster.",
    overview: "Finally, we update our application manifests with the new ECR image digest or tag, and deploy them to the running Amazon EKS cluster. Since Tekton is running inside the same cluster (or a management EKS cluster), we can use the 'kubectl' CLI image. Role-Based Access Control (RBAC) allows our ServiceAccount to apply resources to the cluster.",
    files: [
      {
        filename: "04-kubectl-deploy-task.yaml",
        language: "yaml",
        content: `apiVersion: tekton.dev/v1beta1
kind: Task
metadata:
  name: deploy-eks
  namespace: build-system
spec:
  workspaces:
    - name: source
  params:
    - name: IMAGE
      description: The new image URL to deploy
  steps:
    # Simple example using sed and kubectl. 
    # Real implementations might use Kustomize, Helm, or ArgoCD.
    - name: update-and-apply
      image: roffe/kubectl:latest
      workingDir: $(workspaces.source.path)
      script: |
        #!/bin/sh
        set -e
        echo "Updating deployment manifest with new image: \${IMAGE}"
        sed -i "s|image: .*|image: \${IMAGE}|g" k8s/deployment.yaml
        
        echo "Applying manifests..."
        kubectl apply -f k8s/deployment.yaml
        kubectl apply -f k8s/service.yaml
        
        echo "Deployment triggered successfully."
`
      }
    ]
  },
  {
    id: "pipeline",
    title: "Pipeline Execution",
    icon: "FastForward",
    description: "Tie the steps into a complete Tekton Pipeline and PipelineRun.",
    overview: "We bring all the Tasks together into a Pipeline that executes them sequentially, passing the Workspace between them. We then instantiate a PipelineRun to actually trigger the build, referencing our ECR repository, Git URL, and ServiceAccount.",
    files: [
      {
        filename: "05-pipeline.yaml",
        language: "yaml",
        content: `apiVersion: tekton.dev/v1beta1
kind: Pipeline
metadata:
  name: aws-ecr-eks-pipeline
  namespace: build-system
spec:
  workspaces:
    - name: shared-data
  params:
    - name: git-url
      type: string
    - name: image-url
      type: string
  tasks:
    - name: fetch-repository
      taskRef:
        name: git-clone
      workspaces:
        - name: output
          workspace: shared-data
      params:
        - name: url
          value: $(params.git-url)
        - name: deleteExisting
          value: "true"

    - name: build-and-push-ecr
      taskRef:
        name: kaniko-ecr
      runAfter:
        - fetch-repository
      workspaces:
        - name: source
          workspace: shared-data
      params:
        - name: IMAGE
          value: $(params.image-url)

    - name: deploy-to-cluster
      taskRef:
        name: deploy-eks
      runAfter:
        - build-and-push-ecr
      workspaces:
        - name: source
          workspace: shared-data
      params:
        - name: IMAGE
          value: $(params.image-url)
`
      },
      {
        filename: "06-pipelinerun.yaml",
        language: "yaml",
        content: `apiVersion: tekton.dev/v1beta1
kind: PipelineRun
metadata:
  generateName: my-app-deploy-run-
  namespace: build-system
spec:
  pipelineRef:
    name: aws-ecr-eks-pipeline
  
  # Ensure we use the SA configured with IRSA for AWS ECR push
  serviceAccountName: tekton-aws-sa
  
  workspaces:
    - name: shared-data
      volumeClaimTemplate:
        spec:
          accessModes:
            - ReadWriteOnce
          resources:
            requests:
              storage: 1Gi
              
  params:
    - name: git-url
      value: "https://github.com/my-org/my-app.git"
    - name: image-url
      value: "123456789012.dkr.ecr.eu-west-1.amazonaws.com/my-app:v1.0.4"
`
      }
    ]
  }
];
