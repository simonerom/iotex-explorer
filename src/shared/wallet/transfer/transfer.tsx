import Button from "antd/lib/button";
import Form, { WrappedFormUtils } from "antd/lib/form/Form";
import Col from "antd/lib/grid/col";
import Row from "antd/lib/grid/row";
import Input from "antd/lib/input";
import notification from "antd/lib/notification";
import Select from "antd/lib/select";
import BigNumber from "bignumber.js";
import { Account } from "iotex-antenna/lib/account/account";
import {fromRau, toRau} from "iotex-antenna/lib/account/utils";
import isElectron from "is-electron";
// @ts-ignore
import { t } from "onefx/lib/iso-i18n";
// @ts-ignore
import Helmet from "onefx/lib/react-helmet";
import {styled} from "onefx/lib/styletron-react";
import * as React from "react";
import {useEffect, useState} from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { RouteComponentProps } from "react-router-dom";
import {AccountMeta} from "../../../api-gateway/resolvers/antenna-types";
import { ITokenInfoDict, Token } from "../../../erc20/token";
import ConfirmContractModal from "../../common/confirm-contract-modal";
import { formItemLayout } from "../../common/form-item-layout";
import { getIoPayDesktopVersionName } from "../../common/on-electron-click";
import { rulesMap } from "../../common/rules";
import {colors} from "../../common/styles/style-color";
import {
  numberFromCommaString,
  numberWithCommas
} from "../../common/vertical-table";
import {convertAddress} from "../../utils/util";
import { BroadcastFailure, BroadcastSuccess } from "../broadcast-status";
import {
  GasLimitFormInputItem,
  GasPriceFormInputItem, IOTX_GAS_LIMIT
} from "../contract/cards";
import { getAntenna } from "../get-antenna";
import { FormItemLabel, inputStyle } from "../wallet";
import {IRPCProvider, IWalletState} from "../wallet-reducer";

type Props = {
  form: WrappedFormUtils;
  account?: Account;
  chainId?: number;
  updateWalletInfo?: Function;
  tokens?: ITokenInfoDict;
  network?: IRPCProvider;
} & RouteComponentProps;

type State = {
  accountMeta: AccountMeta | undefined;
  sending: boolean;
  txHash: string;
  broadcast: {
    success: boolean;
  } | null;
  showConfirmTransfer: boolean;
  showDataHex: boolean;
  gasCostLimit: string;
  isIoAddr: boolean
};

const AddressSwitcherContainer = styled("div", {
  display: "inline-block",
  width: "3rem",
  height: "1.3rem",
  lineHeight: "1.3rem",
  borderRadius: "0.125rem",
  cursor: "pointer",
});

const AddressSwitcherItem = styled("div", {
  display: "inline-block",
  width: "1.5rem",
  height: "1.3rem",
  lineHeight: "1.3rem",
  color: "white",
  textAlign: "center",
  cursor: "pointer"
});

const AddressConverterButton = (props: { onSwitch(s: boolean): void, isIoAddr: boolean }) => {

  const [isIoAddr, setIsIoAddr] = useState(props.isIoAddr);

  useEffect(() => {
    setIsIoAddr(props.isIoAddr)
  }, [props.isIoAddr]);

  // @ts-ignore
  const convertAddress = (e) => {
    props.onSwitch(!isIoAddr);
    setIsIoAddr(!isIoAddr);
    e.stopPropagation()
  };

  return (
    <AddressSwitcherContainer onClick={convertAddress}>
      {/* tslint:disable-next-line:use-simple-attributes */}
      <AddressSwitcherItem
        style={{
          color: isIoAddr ? colors.text01 : colors.black80,
          fontSize: isIoAddr ? "1rem" : "0.75rem"
        }}>
        io
      </AddressSwitcherItem>
      {/* tslint:disable-next-line:use-simple-attributes */}
      <AddressSwitcherItem
        style={{
          color: isIoAddr ? colors.black80 : colors.text01,
          fontSize: isIoAddr ? "0.75rem" : "1rem"
        }}>
        0x
      </AddressSwitcherItem>
    </AddressSwitcherContainer>
  );
};

const MAXBtn = styled("div", {
  color: colors.primary,
  position: "absolute",
  top: 0,
  left: "53%",
  zIndex: 999,
  cursor: "pointer"
});

class TransferForm extends React.PureComponent<Props, State> {
  public state: State = {
    accountMeta: undefined,
    sending: false,
    txHash: "",
    broadcast: null,
    showConfirmTransfer: false,
    showDataHex: true,
    gasCostLimit: "",
    isIoAddr: true
  };

  public componentDidMount(): void {
    this.updateGasCostLimit(this.props.form);
  }

  public componentDidUpdate(prevProps: Readonly<Props>): void {
    if (prevProps.network !== this.props.network) {
      this.props.form.setFieldsValue({
        symbol: ""
      })
    }
  }

  public isDisconnected(): boolean {
    return !navigator.onLine;
  }

  public getAccount = async (account: Account) => {
    if (!account) {
      return;
    }
    const addressRes = await getAntenna().iotx.getAccount({
      address: account.address
    });
    if (addressRes) {
      this.setState({ accountMeta: addressRes.accountMeta });
    }
  };

  public sendTransfer = async (status: boolean) => {
    const antenna = getAntenna();
    const { form, account, tokens = {} } = this.props;
    if (!status || !account) {
      return this.setState({
        showConfirmTransfer: false
      });
    }

    const { address } = account;

    form.validateFields(async (err, value) => {
      if (err) {
        return this.setState({
          showConfirmTransfer: false
        });
      }
      const { recipient, gasLimit, gasPrice, dataInHex, symbol } = value;
      const amount = numberFromCommaString(value.amount);
      const customToken = symbol === "" ? null : Token.getToken(symbol);

      const price = gasPrice ? toRau(gasPrice, "Qev") : undefined;
      const toAddress = recipient?.startsWith("0x")
        ? convertAddress(false, recipient)
        : recipient;

      this.setState({ sending: true, showConfirmTransfer: false });
      let txHash = "";
      if (!customToken) {
        window.console.log(
          `antenna.iotx.sendTransfer(${JSON.stringify({
            from: address,
            to: toAddress,
            value: toRau(amount, "Iotx"),
            payload: dataInHex,
            gasLimit: gasLimit || undefined,
            gasPrice: price
          })})`
        );

        try {
          txHash = await antenna.iotx.sendTransfer({
            from: address,
            to: toAddress,
            value: toRau(amount, "Iotx"),
            payload: dataInHex,
            gasLimit: gasLimit || undefined,
            gasPrice: price
          });
        } catch (error) {
          notification.error({
            message: `${error.message}`,
            duration: 3
          });
        }
      } else {
        const tokenInfo = tokens[symbol];
        const tokenAmount = new BigNumber(amount).multipliedBy(
          new BigNumber(`1e${tokenInfo.decimals.toNumber()}`)
        );
        const gasPriceRau = toRau(gasPrice, "Qev");
        window.console.log(
          `customToken.transfer(
                ${toAddress},
                ${tokenAmount.toFixed(0)},
                ${account},
                ${gasPriceRau},
                ${gasLimit}
              )`
        );
        try {
          txHash = await customToken.transfer(
            toAddress,
            tokenAmount,
            account,
            gasPriceRau,
            gasLimit
          );
        } catch (error) {
          notification.error({
            message: `${error.message}`,
            duration: 3
          });
        }
      }
      this.setState({
        sending: false,
        broadcast: {
          success: Boolean(txHash)
        },
        txHash
      });
    });
  };

  public showConfirmTransfer = async () => {
    if (this.isDisconnected()) {
      notification.error({
        message: t("network.disconnected"),
        duration: 5
      });
      return;
    }
    this.props.form.validateFields(err => {
      if (err) {
        return;
      }
      this.setState({
        showConfirmTransfer: true
      });
    });
  };

  public renderSelectTokenSymbol(): JSX.Element | null {
    const { form } = this.props;
    const { getFieldDecorator } = form;
    const { Option } = Select;
    const { tokens = {} } = this.props;
    const { amount } = form.getFieldsValue();
    const tokenTypes: Array<{label: string, key: string}> = [];
    Object.keys(tokens).forEach(addr => {
      const info = tokens[addr];
      if (info) {
        tokenTypes.push({
          label: info.symbol,
          key: addr
        });
      }
    });

    const onOptionChange = async (value: string) => {
      this.estimateGasLimit(value, amount);
    };

    return (
      <>
        {getFieldDecorator("symbol", {
          initialValue: "",
          rules: [
            {
              validator: (_, value, callback) => {
                this.setState({ showDataHex: !!value.match(/iotx/i) });
                callback();
              }
            }
          ]
        })(
          <Select style={{ minWidth: 110 }} onChange={onOptionChange}>
            {tokenTypes.map(type => (
              <Option value={type.key} key={type.key}>
                {type.label}
              </Option>
            ))}
          </Select>
        )}
      </>
    );
  }

  public renderRecipientFormItem(): JSX.Element {
    const { form } = this.props;
    const { getFieldDecorator, getFieldValue, setFieldsValue } = form;

    return <Form.Item
      label={<FormItemLabel>{t("wallet.input.to")}</FormItemLabel>}
      {...formItemLayout}
    >
      {getFieldDecorator("recipient", {
        getValueFromEvent: (event: React.FormEvent<HTMLInputElement>) => {
          const address = event.currentTarget.value.trim();
          this.setState({
            isIoAddr: address.startsWith("io")
          });
          return address
        },
        rules: rulesMap.recipientAddr
      })(
        // tslint:disable-next-line:use-simple-attributes
        <Input
          placeholder={this.state.isIoAddr ? "io..." : "0x..."}
          style={inputStyle}
          name="recipient"
          addonAfter={<AddressConverterButton onSwitch={(s) => {
            let address = getFieldValue("recipient");
            address = convertAddress(!s, address);
            setFieldsValue({
              recipient: address
            });
            this.setState({
              isIoAddr: s
            });
          }} isIoAddr={this.state.isIoAddr} />}
        />
      )}
    </Form.Item>
  }

  // tslint:disable-next-line:typedef
  private async estimateGasLimit(contractAddress: string, amount: string) {
    const {form, tokens = {}, account} = this.props;
    const token = tokens[contractAddress ? contractAddress : ""];
    if (token.symbol === "IOTX") {
      form.setFieldsValue({
        gasLimit: IOTX_GAS_LIMIT
      })
    }

    if (token.symbol !== "IOTX" && account && amount) {
      const erc20Token = Token.getToken(contractAddress);
      const gasLimit = await erc20Token.estimateTransferGas(account, `${Math.ceil(parseFloat(amount))}`);
      form.setFieldsValue({gasLimit})
    }

    this.updateGasCostLimit(this.props.form);
  }

  public renderAmountFormItem(): JSX.Element {
    const { form, tokens = {} } = this.props;
    const { getFieldDecorator } = form;
    const { symbol } = form.getFieldsValue();
    const token = tokens[symbol ? symbol : ""];

    const calculateMax = () => {
      this.estimateGasLimit(symbol, token.balanceString);
      form.setFieldsValue({
        amount: parseFloat(token.balanceString) - parseFloat(this.state.gasCostLimit)
      });
    };

    return (
      <Form.Item
        label={<FormItemLabel>{t("wallet.input.amount")} </FormItemLabel>}
        {...formItemLayout}
      >
        {getFieldDecorator("amount", {
          initialValue: 1,
          normalize: value => numberWithCommas(`${value}`),
          rules: rulesMap.transactionAmount
        })(
          <Input
            className="form-input"
            placeholder="1"
            addonAfter={this.renderSelectTokenSymbol()}
            onChange={(e) => {
              this.estimateGasLimit(symbol, e.target.value)
            }}
            name="amount"
          />
        )}
        {
          token &&
          <MAXBtn
            onClick={calculateMax}
          >{t("wallet.input.max")}</MAXBtn>
        }
      </Form.Item>
    );
  }

  public renderTransferForm = () => {
    const { form } = this.props;
    const { getFieldDecorator } = form;
    const { sending } = this.state;
    return (
      <Form
        layout="vertical"
        onChange={() => {
          this.updateGasCostLimit(form);
        }}
      >
        {this.renderRecipientFormItem()}
        {this.renderAmountFormItem()}
        <GasPriceFormInputItem form={form} />
        <GasLimitFormInputItem form={form} />
        {this.state.showDataHex && (
          <Form.Item
            label={<FormItemLabel>{t("wallet.input.dib")}</FormItemLabel>}
            {...formItemLayout}
          >
            {getFieldDecorator("dataInHex", {
              rules: rulesMap.dataIndex
            })(
              <Input style={inputStyle} placeholder="1234" name="dataInHex" />
            )}
          </Form.Item>
        )}
        <Form.Item
          label={
            <FormItemLabel>{t("wallet.input.gasCostLimit")}</FormItemLabel>
          }
          {...formItemLayout}
        >
          <div
            style={{
              padding: "4px 11px",
              border: "1px solid #d9d9d9",
              borderRadius: 4,
              ...inputStyle
            }}
          >
            {`${numberWithCommas(this.state.gasCostLimit)} IOTX`}
          </div>
        </Form.Item>
        {
          // @ts-ignore
          <Button
            type="primary"
            loading={sending}
            onClick={this.showConfirmTransfer}
            disabled={this.isDisconnected()}
          >
            {t("wallet.transactions.send")}
          </Button>
        }
      </Form>
    );
  };

  public renderSendNew: JSX.Element = (
    <Button
      onClick={() => {
        this.setState({
          broadcast: null
        });
      }}
    >
      {`${t("wallet.transfer.sendNew")}`}
    </Button>
  );

  public displayRawTransfer = () => {
    return (
      <Row gutter={4}>
        <Col span={12}>
          <label>{t("wallet.transactionDetail.raw")}</label>
          <pre />
        </Col>
        <Col span={12}>
          <label>{t("wallet.transactionDetail.raw")}</label>
          <pre />
        </Col>
      </Row>
    );
  };

  public confirmTransfer = () => {
    const { account, form, tokens = {} } = this.props;
    if (!account) {
      return null;
    }
    const { address } = account;
    const { showConfirmTransfer } = this.state;

    const {
      recipient,
      amount,
      gasLimit,
      gasPrice,
      symbol,
      dataInHex
    } = form.getFieldsValue();

    const tokenSymbol = symbol === "iotx" ? "IOTX" : tokens[symbol] ? tokens[symbol].symbol : "IOTX";
    const dataSource: { [index: string]: string } = {
      address: address,
      toAddress: recipient?.startsWith("0x")
        ? convertAddress(false, recipient)
        : recipient,
      amount: `${new BigNumber(
        numberFromCommaString(amount)
      ).toString()} ${tokenSymbol}`,
      limit: gasLimit,
      price: `${toRau(gasPrice, "Qev")} (${gasPrice} Qev)`
    };

    if (tokenSymbol.match(/iotx/i)) {
      dataSource.dataInHex = `${dataInHex || " "}`; // Fix undefined and always display Data field in modal if it is needed.
    }

    return (
      <ConfirmContractModal
        dataSource={dataSource}
        confirmContractOk={this.sendTransfer}
        showModal={showConfirmTransfer}
      />
    );
  };

  public updateGasCostLimit = (form: WrappedFormUtils) => {
    const { gasLimit, gasPrice } = form.getFieldsValue();
    if (!gasLimit || !gasPrice) {
      return;
    }
    const gasCostLimit = fromRau(
      `${Number(toRau(gasPrice, "Qev")) * gasLimit}`,
      "IoTx"
    );
    if (gasCostLimit !== this.state.gasCostLimit) {
      this.setState({ gasCostLimit });
    }
  };

  public render(): JSX.Element {
    const { txHash, broadcast } = this.state;

    if (broadcast) {
      if (broadcast.success) {
        return <BroadcastSuccess txHash={txHash} action={this.renderSendNew} />;
      }
      return (
        <BroadcastFailure
          suggestedMessage={t("wallet.transfer.broadcast.fail", {
            token: t("account.testnet.token")
          })}
          errorMessage={""}
          action={this.renderSendNew}
        />
      );
    }

    const title = isElectron()
      ? `${getIoPayDesktopVersionName()} - ${t(
          "wallet.send-receive.title"
        )}, ${t("meta.description.desktop")}`
      : `${t("wallet.transfer.title")} - ${t("meta.description")}`;
    return (
      <div style={{ paddingRight: 2, paddingTop: 20 }}>
        <Helmet title={title} />
        {this.renderTransferForm()}
        {this.confirmTransfer()}
      </div>
    );
  }
}

const mapStateToProps = (state: {
  wallet: IWalletState;
}): {
  account?: Account;
  tokens?: ITokenInfoDict;
  network?: IRPCProvider;
} => ({
  account: (state.wallet || {}).account,
  tokens: (state.wallet || {}).tokens || {},
  network: (state.wallet || {}).network,
});

const TransferFormComp = Form.create<Props>()(TransferForm);

export default connect(mapStateToProps)(withRouter(TransferFormComp));
