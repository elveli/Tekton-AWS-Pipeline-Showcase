# Tekton AWS ECR & EKS Pipeline Complete Guide

Welcome to the **Tekton on AWS Sample Application**. This guide provides comprehensive instructions on how to take the configuration templates from this repository and apply them to a real Amazon EKS cluster.

## What You See

This sample contains a set of Kubernetes manifests for [Tekton Pipelines](https://tekton.dev/). When applied, they form a robust CI/CD pipeline that:
1. **Clones** source code from a Git repository.
2. **Builds** a Docker image without privileged access using Kaniko.
3. **Pushes** the container image to Amazon Elastic Container Registry (ECR) securely utilizing IAM Roles for Service Accounts (IRSA).
4. **Deploys** the new image to an Amazon Elastic Kubernetes Service (EKS) cluster using the `kubectl` task.

In the interactive dashboard (the React app), you can click through the "Pipeline Stages" to view the specific `.yaml` configurations needed for each step.

---

## Prerequisites

Before executing this pipeline, you need:
1. **Amazon EKS Cluster**: An active Kubernetes cluster running on AWS. *(Can be provisioned via the included Terraform configuration).*
2. **Tekton Installed**: Tekton Pipelines installed on your EKS cluster.
   ```bash
   kubectl apply --filename https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml
   ```
3. **OIDC Provider Enabled**: Your EKS cluster must have an IAM OIDC provider configured (required for IRSA).
4. **AWS ECR Repository**: A target container registry (e.g., `123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app`). *(Can be provisioned via Terraform).*
5. **Git Repository**: A repository containing a `Dockerfile` and some Kubernetes deployment manifests in a `k8s/` folder.

---

## Local Desktop Setup (No AWS)

### Local Configuration Update
If you just want to run this pipeline locally on **Docker Desktop**, **Minikube**, or **kind** without interacting with AWS, please refer to the **Local Desktop Setup** stage in the dashboard. 

The dashboard provides alternative definitions (\`local-kaniko-task.yaml\`, \`local-pipeline.yaml\`, and \`local-pipelinerun.yaml\`) which utilize [ttl.sh](https://ttl.sh), a free, anonymous, ephemeral container registry perfect for local Tekton testing without authentication hassles!

---

## Configuration & Setup

### 0. (Optional) Provision Infrastructure with Terraform

If you prefer Infrastructure as Code over manual setup, check the **Infrastructure as Code** stage in the dashboard.
It provides a `main.tf` file that provisions a complete **VPC**, an **EKS Cluster**, the **ECR repository**, and the OIDC-backed **IAM Role** for Tekton.

**Resources Created:**
- **VPC** (`10.45.0.0/16` by default) with public/private subnets and a NAT gateway.
- **EKS Cluster** (`tekton-cluster`, v1.30) with managed node groups (2x `t3.medium` instances).
- **ECR Repository** (`my-app-repo`) for your container images.
- **IAM Policy & IRSA Role** (`TektonPipelineRole`) automatically linked to your EKS OIDC provider and the `build-system:tekton-aws-sa` Kubernetes service account.

```bash
terraform init
terraform apply
# After applying, configure your local kubeconfig:
aws eks update-kubeconfig --region us-east-1 --name tekton-cluster
```

*(If you use Terraform, skip the AWS IAM steps in Section 1, but you must still apply the Kubernetes Service Account manifest).*

---

### 1. Configure the Kubernetes Service Account & IRSA

Regardless of whether you used Terraform or a manual AWS setup, your Kubernetes cluster needs a `ServiceAccount` properly annotated with the AWS IAM Role ARN so Tekton can authenticate via IRSA.

**If you used Terraform:**
1. Get the generated IAM Role ARN:
   ```bash
   terraform output iam_role_arn
   ```
2. Edit `tekton/01-service-account.yaml` and replace the `eks.amazonaws.com/role-arn` annotation with your actual ARN.
3. Apply the manifest:
   ```bash
   kubectl apply -f tekton/01-service-account.yaml
   ```
4. *Skip to Step 2.*

**If you are doing a manual setup (No Terraform):**
If you didn't run Terraform, you can configure the AWS resources manually using `aws` and `eksctl`:

**A. Create an IAM Policy for ECR Access:**
Copy the policy from the "AWS IRSA Setup" stage (`tekton/iam-policy.json`) and create it in AWS IAM:
```bash
aws iam create-policy --policy-name TektonECRPushPolicy --policy-document file://tekton/iam-policy.json
```

**B. Create IAM Role mapped to the Service Account:**
Using `eksctl`, create an IAM role bound to the `tekton-aws-sa` ServiceAccount in the `build-system` namespace.
```bash
eksctl create iamserviceaccount \
  --cluster=<YOUR_CLUSTER_NAME> \
  --namespace=build-system \
  --name=tekton-aws-sa \
  --attach-policy-arn=arn:aws:iam::<ACCOUNT_ID>:policy/TektonECRPushPolicy \
  --approve
```

*(Note: `eksctl create iamserviceaccount` automatically creates the Kubernetes ServiceAccount for you. You do not need to apply `tekton/01-service-account.yaml` if you chose this route).*

### 2. Apply Tekton Tasks

You need to register the reusable "Tasks" with your cluster:

1. **Git Clone Task** (from Tekton Catalog):
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/tektoncd/catalog/main/task/git-clone/0.9/git-clone.yaml
   ```
2. **Kaniko ECR Task**:
   ```bash
   kubectl apply -f tekton/03-kaniko-ecr-task.yaml
   ```
3. **Deploy EKS Task**:
   ```bash
   kubectl apply -f tekton/04-kubectl-deploy-task.yaml
   ```

### 3. Apply the Pipeline

The Pipeline binds the above tasks together:
```bash
kubectl apply -f tekton/05-pipeline.yaml
```

### 4. Trigger the PipelineRun

Finally, update the parameters in `tekton/06-pipelinerun.yaml` to point to your specific Git repository and ECR registry:
```yaml
  params:
    - name: git-url
      value: "https://github.com/your-org/your-repo.git"
    - name: image-url
      value: "YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/your-app:v1.0.0"
```

Execute the run:
```bash
kubectl create -f tekton/06-pipelinerun.yaml
```

---

## Monitoring and Execution

Once the `PipelineRun` is created, Tekton orchestrates the pods.

### Using Tekton Dashboard (Web UI)
Tekton provides an official web-based dashboard that lets you visualize Pipelines, PipelineRuns, and Task logs directly from your browser.

Install the Dashboard:
```bash
kubectl apply --filename https://storage.googleapis.com/tekton-releases/dashboard/latest/release.yaml
```

Access the Dashboard via port-forwarding:
```bash
kubectl --namespace tekton-pipelines port-forward svc/tekton-dashboard 9097:9097
```
Then, open [http://localhost:9097](http://localhost:9097) in your browser.

### Using Tekton CLI (`tkn`)
The Tekton CLI (`tkn`) provides the best developer experience for managing pipelines.

Observe the logs interactively for the last PipelineRun:
```bash
tkn pipelinerun logs -f -L
```

List all PipelineRuns:
```bash
tkn pipelinerun list
```

Describe a specific PipelineRun to see detailed task status:
```bash
tkn pipelinerun describe <run-name>
```

Cancel a running PipelineRun:
```bash
tkn pipelinerun cancel <run-name>
```

### Using kubectl
If you don't have the `tkn` CLI installed, `kubectl` works too.

Check the status of the PipelineRun:
```bash
kubectl get pipelinerun
```

Describe the PipelineRun in detail (useful for finding why a run failed or is pending):
```bash
kubectl describe pipelinerun <run-name>
```

Check the individual underlying TaskRuns:
```bash
kubectl get taskrun
kubectl describe taskrun <taskrun-name>
```

Get logs of the actual Pod running the Task:
```bash
kubectl get pods
# Note: Tekton pods usually have the TaskRun name prefix
kubectl logs <pod-name> -c step-<step-name>
```

---

## Troubleshooting Guide

### 1. `ImagePullBackOff` or `unauthorized: authentication required` on push
**Cause**: The Kaniko task pod doesn't have the AWS credentials to push to ECR.
**Fix**:
- Verify the ServiceAccount (`tekton-aws-sa`) has the correct `eks.amazonaws.com/role-arn` annotation.
- Verify the AWS IAM Role has a Trust Relationship that allows the exact OIDC subject (`system:serviceaccount:build-system:tekton-aws-sa`).
- Check if the ECR repository actually exists in that AWS region.
- Ensure you passed `AWS_SDK_LOAD_CONFIG="true"` environment variable to the Kaniko container.

### 2. Task `fetch-repository` fails with Authentication Error
**Cause**: The Git repository is private and no SSH key or Personal Access Token was provided.
**Fix**:
- Create a Kubernetes Secret containing your Git credentials.
- Attach the secret to the `tekton-aws-sa` ServiceAccount using the `secrets:` array.
- Reference the Tekton documentation on ["Authentication for Git"](https://tekton.dev/docs/pipelines/auth/).

### 3. PipelineRun stays in `Pending` state forever
**Cause**: Usually a missing Workspace (PersistentVolumeClaim).
**Fix**:
- Check the PipelineRun description: `kubectl describe pr <name>`.
- If it complains about PVCs, ensure your cluster has a default StorageClass capable of dynamic provisioning (like `gp2` or `gp3` on EKS), or manually create the PersistentVolume attached to the Workspace.

### 4. Deploy task fails with `PermissionDenied`
**Cause**: The Service Account (`tekton-aws-sa`) needs Kubernetes RBAC permissions to `apply` Deployments and Services in the target namespace.
**Fix**: Create a Role and RoleBinding granting appropriate access over Kubernetes objects.
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: tekton-deploy-binding
  namespace: target-namespace
subjects:
- kind: ServiceAccount
  name: tekton-aws-sa
  namespace: build-system
roleRef:
  kind: ClusterRole
  name: edit # or admin, depending on resources created
  apiGroup: rbac.authorization.k8s.io
```
