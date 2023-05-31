import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as dotenv from "dotenv";
import { Subnet } from "@pulumi/aws/ec2";

dotenv.config();

const dbEngine = "aurora-postgresql";

const availabilityZoneNames = ['eu-west-2a', 'eu-west-2b'];

export = async () => {
    const vpc = new awsx.ec2.Vpc("slim-travel", {
        availabilityZoneNames: availabilityZoneNames,
        enableDnsSupport: true,
        enableDnsHostnames: true
    });
    const dbSubnetGroup = new aws.rds.SubnetGroup("dbsubnet", {
        name: "slim-travel",
        subnetIds: vpc.privateSubnetIds,
    });
    const cluster = new aws.rds.Cluster("slim-travel", {
        availabilityZones: availabilityZoneNames,
        dbSubnetGroupName: dbSubnetGroup.name,
        backupRetentionPeriod: 35,
        clusterIdentifier: "slim-travel",
        databaseName: "SlimTravel",
        engine: dbEngine,
        masterUsername: <string>process.env.POSTGRESQL_USERNAME,
        masterPassword: <string>process.env.POSTGRESQL_PASSWORD,
        preferredBackupWindow: "07:00-09:00",
        skipFinalSnapshot: true
    }, {
        ignoreChanges: ["availabilityZones"]
    });
    for (let i = 0; i < availabilityZoneNames.length; i++) {
        new aws.rds.ClusterInstance(`slim-travel-${i + 1}`, {
            clusterIdentifier: cluster.id,
            engine: dbEngine,
            instanceClass: aws.rds.InstanceType.T3_Medium,
            availabilityZone: availabilityZoneNames[i],
            publiclyAccessible: true
        });
    }
    const clientVpnEndpoint = new aws.ec2clientvpn.Endpoint("slim-travel-clientvpn", {
        vpcId: vpc.vpcId,
        serverCertificateArn: "arn:aws:acm:eu-west-2:486087129309:certificate/feb470b7-caa5-45a8-935f-146e7ef4eecd",
        clientCidrBlock: "10.1.0.0/16",
        authenticationOptions: [{
            type: "certificate-authentication",
            rootCertificateChainArn: "arn:aws:acm:eu-west-2:486087129309:certificate/fa995600-1a33-4fa4-b9da-c3124f440431",
        }],
        connectionLogOptions: {
            enabled: false
        },
        clientConnectOptions: {
            enabled: false
        },
        splitTunnel: true
    });
    vpc.privateSubnetIds.apply(privateSubnetIds => {
        for (let i = 0; i < privateSubnetIds.length; i++) {
            new aws.ec2clientvpn.NetworkAssociation(`slim-travel-${i+1}`, {
                clientVpnEndpointId: clientVpnEndpoint.id,
                subnetId: privateSubnetIds[i],
            });
        }
    });
    pulumi.all([vpc.subnets, vpc.privateSubnetIds]).apply(([subnets, privateSubnetIds]) => {
        const subnetsById:{ [key: string]: Subnet } = {};
        pulumi.all(subnets.map(subnet => subnet.id)).apply(subnetIds => {
            for (let i = 0; i < subnets.length; i++) {
                subnetsById[subnetIds[i]] = subnets[i];
            }
            const privateSubnets = privateSubnetIds.map(privateSubnetId => subnetsById[privateSubnetId]);
            pulumi.all(privateSubnets.map(privateSubnet => privateSubnet.cidrBlock)).apply(privateSubnetCidrBlocks => {
                let i = 0;
                for (; i < privateSubnetCidrBlocks.length; i++) {
                    new aws.ec2clientvpn.AuthorizationRule(`slim-travel-${i + 1}`, {
                        clientVpnEndpointId: clientVpnEndpoint.id,
                        targetNetworkCidr: <string>privateSubnetCidrBlocks[i],
                        authorizeAllGroups: true
                    });
                    new aws.ec2clientvpn.Route(`slim-travel-${i + 1}`, {
                        clientVpnEndpointId: clientVpnEndpoint.id,
                        destinationCidrBlock: "0.0.0.0/0",
                        targetVpcSubnetId: privateSubnets[i].id,
                    });
                }
            });
        });
    });
}